import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  getMissingConfigFields,
  injectPluginEntry,
  installGame,
  loadVersionInfo,
  patchEmptyPackageName,
} from "../installer-core.mjs";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDirectory, "..");

test("patchEmptyPackageName only updates empty name fields", () => {
  const changed = patchEmptyPackageName('{"name":"","window":{"title":"Demo"}}');
  assert.equal(changed.changed, true);
  assert.equal(changed.text, '{"name":"Game","window":{"title":"Demo"}}');

  const untouched = patchEmptyPackageName('{"name":"Already Set"}');
  assert.equal(untouched.changed, false);
  assert.equal(untouched.text, '{"name":"Already Set"}');
});

test("injectPluginEntry inserts the loader entry once", () => {
  const entry = '{"name":"live-translator-loader","status":true,"description":"Entry point","parameters":{}},';
  const injected = injectPluginEntry('[{"name":"AnotherPlugin"}]', entry);
  assert.equal(injected.changed, true);
  assert.equal(
    injected.text,
    `[${entry}{"name":"AnotherPlugin"}]`,
  );

  const alreadyPresent = injectPluginEntry(`[${entry}]`, entry);
  assert.equal(alreadyPresent.changed, false);
  assert.equal(alreadyPresent.alreadyPresent, true);
});

test("getMissingConfigFields reports missing leaf paths from bundled defaults", () => {
  const missingFields = getMissingConfigFields(
    {
      settings: {
        translation: {
          disableCjkFilter: false,
          maxOutputTokens: 512,
        },
        gameMessage: {
          textScale: 100,
        },
      },
      translator: {
        provider: "local",
        settings: {
          deepl: {
            apiKey: "________NONE________",
          },
        },
      },
    },
    {
      settings: {
        translation: {
          disableCjkFilter: false,
        },
      },
      translator: {
        provider: "local",
        settings: {},
      },
    },
  );

  assert.deepEqual(missingFields, [
    "settings.json:translation.maxOutputTokens",
    "settings.json:gameMessage.textScale",
    "translator.json:settings.deepl.apiKey",
  ]);
});

test("loadVersionInfo returns the bundled version when version.json is present", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(options?.cache, "no-store");
    return createFetchResponse({
      "/version.json": JSON.stringify({ version: "1.12" }),
    }, url);
  };

  try {
    const version = await loadVersionInfo("https://example.test/version.json");
    assert.equal(version, "1.12");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("loadVersionInfo returns null when version.json is missing", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => createFetchResponse({}, url);

  try {
    const version = await loadVersionInfo("https://example.test/version.json");
    assert.equal(version, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("installGame overwrites existing config files during reinstall", async () => {
  const rootHandle = createFakeDirectory("Game");
  const jsHandle = rootHandle.addDirectory("js");
  const pluginsHandle = jsHandle.addDirectory("plugins");
  const supportHandle = pluginsHandle.addDirectory("live-translator");

  rootHandle.setFileText("package.json", '{"name":"Game"}\n');
  jsHandle.setFileText("plugins.js", "[]\n");
  supportHandle.setFileText("settings.json", '{ "gameMessage": {} }\n');
  supportHandle.setFileText("translator.json", '{ "provider": "deepl" }\n');

  const manifest = {
    bundleDirectory: "live-translator-installer",
    loaderFile: "live-translator-loader.js",
    supportDirectory: "live-translator",
    supportFiles: ["settings.json", "translator.json"],
    pluginEntry: '{"name":"live-translator-loader","status":true,"description":"Entry point","parameters":{}},',
  };

  const defaultSettings = '{\n    "translation": {\n        "maxOutputTokens": 512\n    },\n    "gameMessage": {\n        "textScale": 100\n    }\n}\n';
  const defaultTranslator = '{\n    "provider": "local"\n}\n';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => createFetchResponse({
    "/live-translator-installer/live-translator-loader.js": 'console.log("loader");\n',
    "/live-translator-installer/settings.json": defaultSettings,
    "/live-translator-installer/translator.json": defaultTranslator,
  }, url);

  try {
    await installGame(rootHandle, manifest, {
      baseUrl: "https://example.test/app.mjs",
      overwriteExistingConfigs: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(
    supportHandle.readFileText("settings.json"),
    defaultSettings,
  );
  assert.equal(
    supportHandle.readFileText("translator.json"),
    defaultTranslator,
  );
});

test("installer-manifest.json tracks the copied support bundle", async () => {
  const manifestPath = path.join(repoRoot, "installer-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  const bundleDirectory = path.join(repoRoot, manifest.bundleDirectory);
  const actualFiles = await readdir(bundleDirectory, { withFileTypes: true });
  const copiedFiles = actualFiles
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => !["install", "installer.ps1", "installer.sh", manifest.loaderFile].includes(name))
    .sort();

  const manifestFiles = [...manifest.supportFiles].sort();
  assert.deepEqual(manifestFiles, copiedFiles);
});

function createFetchResponse(assets, url) {
  const pathname = new URL(String(url)).pathname;
  const body = assets[pathname];

  if (typeof body === "undefined") {
    return {
      ok: false,
      status: 404,
      async text() {
        return "";
      },
      async arrayBuffer() {
        return new ArrayBuffer(0);
      },
    };
  }

  return {
    ok: true,
    status: 200,
    async json() {
      return JSON.parse(body);
    },
    async text() {
      return body;
    },
    async arrayBuffer() {
      return new TextEncoder().encode(body).buffer;
    },
  };
}

function createFakeDirectory(name) {
  return new FakeDirectoryHandle(name);
}

class FakeDirectoryHandle {
  constructor(name) {
    this.name = name;
    this.directories = new Map();
    this.files = new Map();
  }

  addDirectory(name) {
    const directory = new FakeDirectoryHandle(name);
    this.directories.set(name, directory);
    return directory;
  }

  setFileText(name, text) {
    this.files.set(name, new TextEncoder().encode(text));
  }

  readFileText(name) {
    const bytes = this.files.get(name);
    return new TextDecoder().decode(bytes);
  }

  async getDirectoryHandle(name, options = {}) {
    const existingDirectory = this.directories.get(name);
    if (existingDirectory) {
      return existingDirectory;
    }

    if (options.create) {
      return this.addDirectory(name);
    }

    throw createNotFoundError();
  }

  async getFileHandle(name, options = {}) {
    if (this.files.has(name)) {
      return new FakeFileHandle(this, name);
    }

    if (options.create) {
      this.setFileText(name, "");
      return new FakeFileHandle(this, name);
    }

    throw createNotFoundError();
  }
}

class FakeFileHandle {
  constructor(parent, name) {
    this.parent = parent;
    this.name = name;
  }

  async getFile() {
    const bytes = this.parent.files.get(this.name);
    return {
      async arrayBuffer() {
        const copy = new Uint8Array(bytes);
        return copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength);
      },
    };
  }

  async createWritable() {
    return {
      write: async (value) => {
        this.parent.files.set(this.name, normalizeWritableValue(value));
      },
      close: async () => {},
    };
  }
}

function normalizeWritableValue(value) {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value);
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }

  throw new TypeError(`Unsupported writable value: ${typeof value}`);
}

function createNotFoundError() {
  const error = new Error("Not found");
  error.name = "NotFoundError";
  return error;
}
