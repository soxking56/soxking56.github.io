import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConfigGroups,
  cloneConfigSet,
  configDraftsEqual,
  getValueAtPath,
  setValueAtPath,
  validateNumberValue,
} from "../config-editor.mjs";

test("buildConfigGroups flattens nested objects and arrays into editable fields", () => {
  const groups = buildConfigGroups({
    provider: "deepl",
    settings: {
      local: {
        model: "gemma",
        temperature: 0.8,
      },
      deepl: {
        apiKey: "secret",
      },
      suppressExact: [
        { regex: "^skip$" },
        "raw message",
      ],
    },
  });

  assert.deepEqual(
    groups.map((group) => ({
      label: group.label,
      fields: group.fields.map((field) => ({
        label: field.label,
        inputKind: field.inputKind,
      })),
    })),
    [
      {
        label: "General",
        fields: [
          { label: "provider", inputKind: "text" },
        ],
      },
      {
        label: "settings",
        fields: [
          { label: "local.model", inputKind: "text" },
          { label: "local.temperature", inputKind: "number" },
          { label: "deepl.apiKey", inputKind: "secret" },
          { label: "suppressExact[0].regex", inputKind: "textarea" },
          { label: "suppressExact[1]", inputKind: "text" },
        ],
      },
    ],
  );
});

test("setValueAtPath updates nested objects without rebuilding the whole config", () => {
  const draft = cloneConfigSet({
    settings: {
      logging: {
        enabled: true,
      },
      suppressExact: [
        { regex: "^skip$" },
      ],
    },
    translator: {
      settings: {
        local: {
          temperature: 0.8,
        },
      },
    },
  });

  setValueAtPath(draft.settings, ["logging", "enabled"], false);
  setValueAtPath(draft.settings, ["suppressExact", 0, "regex"], "^keep$");
  setValueAtPath(draft.translator, ["settings", "local", "temperature"], 1.1);

  assert.equal(draft.settings.logging.enabled, false);
  assert.equal(draft.settings.suppressExact[0].regex, "^keep$");
  assert.equal(draft.translator.settings.local.temperature, 1.1);
  assert.equal(
    configDraftsEqual(draft, {
      settings: {
        logging: {
          enabled: true,
        },
        suppressExact: [
          { regex: "^skip$" },
        ],
      },
      translator: {
        settings: {
          local: {
            temperature: 0.8,
          },
        },
      },
    }),
    false,
  );
});

test("setValueAtPath creates missing nested containers and getValueAtPath reads them back", () => {
  const draft = cloneConfigSet({
    translator: {},
  });

  setValueAtPath(draft.translator, ["settings", "deepl", "apiKey"], "abc123");
  setValueAtPath(draft.translator, ["settings", "local", "port"], 1234);

  assert.equal(getValueAtPath(draft.translator, ["settings", "deepl", "apiKey"]), "abc123");
  assert.equal(getValueAtPath(draft.translator, ["settings", "local", "port"]), 1234);
  assert.equal(getValueAtPath(draft.translator, ["settings", "local", "model"]), undefined);
});

test("validateNumberValue enforces integer and range constraints", () => {
  assert.equal(validateNumberValue(100, { integer: true, min: 1, max: 100 }), true);
  assert.equal(validateNumberValue(0, { integer: true, min: 1, max: 100 }), false);
  assert.equal(validateNumberValue(101, { integer: true, min: 1, max: 100 }), false);
  assert.equal(validateNumberValue(50.5, { integer: true, min: 1, max: 100 }), false);
  assert.equal(validateNumberValue(50.5, { min: 1, max: 100 }), true);
});
