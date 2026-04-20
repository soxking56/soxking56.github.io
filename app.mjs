import {
  ensureReadWritePermission,
  inspectGameDirectory,
  installGame,
  loadInstalledConfigs,
  loadManifest,
  loadVersionInfo,
  saveInstalledConfigs,
} from "./installer-core.mjs";
import {
  cloneConfigSet,
  configDraftsEqual,
  getValueAtPath,
  setValueAtPath,
  validateNumberValue,
} from "./config-editor.mjs";
import {
  createTranslator,
  detectPreferredLocale,
} from "./i18n.mjs";

const SETTINGS_FIELD = {
  id: "translation.disableCjkFilter",
  path: ["translation", "disableCjkFilter"],
  inputKind: "checkbox",
  label: "disableCjkFilter",
  descriptionKey: "field.translation.disableCjkFilter.description",
  tooltipKey: "field.translation.disableCjkFilter.tooltip",
};

const GAME_MESSAGE_TEXT_SCALE_FIELD = {
  id: "gameMessage.textScale",
  path: ["gameMessage", "textScale"],
  inputKind: "number",
  label: "textScale",
  descriptionKey: "field.gameMessage.textScale.description",
  tooltipKey: "field.gameMessage.textScale.tooltip",
  integer: true,
  min: 1,
  max: 100,
  validationMessageKey: "error.gameMessageTextScaleRange",
};

const LOCAL_TRANSLATOR_FIELDS = [
  {
    id: "settings.local.address",
    path: ["settings", "local", "address"],
    inputKind: "text",
    label: "address",
    tooltipKey: "field.local.address.tooltip",
  },
  {
    id: "settings.local.port",
    path: ["settings", "local", "port"],
    inputKind: "number",
    label: "port",
    tooltipKey: "field.local.port.tooltip",
  },
  {
    id: "settings.local.model",
    path: ["settings", "local", "model"],
    inputKind: "text",
    label: "model",
    tooltipKey: "field.local.model.tooltip",
  },
  {
    id: "settings.local.system_prompt",
    path: ["settings", "local", "system_prompt"],
    inputKind: "textarea",
    label: "system_prompt",
    tooltipKey: "field.local.systemPrompt.tooltip",
  },
  {
    id: "settings.local.temperature",
    path: ["settings", "local", "temperature"],
    inputKind: "number",
    label: "temperature",
    tooltipKey: "field.local.temperature.tooltip",
  },
  {
    id: "settings.local.top_p",
    path: ["settings", "local", "top_p"],
    inputKind: "number",
    label: "top_p",
    tooltipKey: "field.local.topP.tooltip",
  },
  {
    id: "settings.local.top_k",
    path: ["settings", "local", "top_k"],
    inputKind: "number",
    label: "top_k",
    tooltipKey: "field.local.topK.tooltip",
  },
  {
    id: "settings.local.min_p",
    path: ["settings", "local", "min_p"],
    inputKind: "number",
    label: "min_p",
    tooltipKey: "field.local.minP.tooltip",
  },
  {
    id: "settings.local.repeat_penalty",
    path: ["settings", "local", "repeat_penalty"],
    inputKind: "number",
    label: "repeat_penalty",
    tooltipKey: "field.local.repeatPenalty.tooltip",
  },
];

const DEEPL_TRANSLATOR_FIELDS = [
  {
    id: "settings.deepl.language",
    path: ["settings", "deepl", "language"],
    inputKind: "text",
    label: "language",
    tooltipKey: "field.deepl.language.tooltip",
  },
  {
    id: "settings.deepl.apiKey",
    path: ["settings", "deepl", "apiKey"],
    inputKind: "sensitive-text",
    label: "apiKey",
    tooltipKey: "field.deepl.apiKey.tooltip",
  },
];
const DEEPL_APIKEY_PLACEHOLDER_SUBSTRING = "__NONE__";
const locale = detectPreferredLocale(window.navigator);
const t = createTranslator(locale);

const state = {
  manifest: null,
  rootHandle: null,
  inspection: null,
  busy: false,
  busyAction: null,
  logs: [],
  existingInstallationDetected: false,
  loadedConfigs: null,
  configDraft: null,
  configEditable: false,
  configAlertMessage: "",
  configStatusMessage: t("config.status.initial"),
  configErrors: new Set(),
  translatorVersion: null,
};

const pickFolderButton = document.querySelector("#pick-folder-button");
const installButton = document.querySelector("#install-button");
const saveConfigButton = document.querySelector("#save-config-button");
const resetConfigButton = document.querySelector("#reset-config-button");
const translatorVersion = document.querySelector("#translator-version");
const supportNote = document.querySelector("#support-note");
const configAlert = document.querySelector("#config-alert");
const folderName = document.querySelector("#folder-name");
const folderStatus = document.querySelector("#folder-status");
const folderLayout = document.querySelector("#folder-layout");
const pluginTarget = document.querySelector("#plugin-target");
const pluginsFile = document.querySelector("#plugins-file");
const packageList = document.querySelector("#package-list");
const configStatus = document.querySelector("#config-status");
const settingsConfigFields = document.querySelector("#settings-config-fields");
const translatorConfigFields = document.querySelector("#translator-config-fields");
const logList = document.querySelector("#log-list");

applyDocumentTranslations();

pickFolderButton.addEventListener("click", handlePickFolder);
installButton.addEventListener("click", handleInstall);
saveConfigButton.addEventListener("click", handleSaveConfig);
resetConfigButton.addEventListener("click", handleResetConfig);

render();
initialize();

function applyDocumentTranslations() {
  document.documentElement.lang = locale;

  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n);
  }

  for (const element of document.querySelectorAll("[data-i18n-html]")) {
    element.innerHTML = t(element.dataset.i18nHtml);
  }

  for (const element of document.querySelectorAll("[data-i18n-title]")) {
    element.title = t(element.dataset.i18nTitle);
  }
}

async function initialize() {
  state.translatorVersion = await loadVersionInfo(new URL("./version.json", import.meta.url));

  if (!supportsInstallation()) {
    pushLog(t("error.browserCannotInstall"), "error");
    render();
    return;
  }

  try {
    state.manifest = await loadManifest(new URL("./installer-manifest.json", import.meta.url), { t });
    pushLog(
      t("log.bundleLoaded", {
        count: state.manifest.supportFiles.length + 1,
      }),
      "info",
    );

    if (state.rootHandle) {
      await refreshInstalledConfigSnapshot({ logOutcome: false });
    }
  } catch (error) {
    pushLog(t("error.loadBundle", { message: error.message }), "error");
  }

  render();
}

async function handlePickFolder() {
  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    state.rootHandle = handle;
    pushLog(t("log.selectedFolder", { name: handle.name }), "info");

    state.inspection = await inspectGameDirectory(handle, { t });
    if (state.inspection.valid) {
      pushLog(t("log.detectedLayout", { layout: state.inspection.layoutLabel }), "success");
    } else {
      pushLog(state.inspection.reason, "warning");
    }

    await refreshInstalledConfigSnapshot({ logOutcome: true });
  } catch (error) {
    if (error?.name !== "AbortError") {
      pushLog(t("error.folderSelection", { message: error.message }), "error");
    }
  }

  render();
}

async function handleInstall() {
  if (!canInstall()) {
    return;
  }

  state.busy = true;
  state.busyAction = "install";
  render();

  try {
    const permissionGranted = await ensureReadWritePermission(state.rootHandle);
    if (!permissionGranted) {
      throw new Error(t("error.permissionDenied"));
    }

    const reinstall = hasExistingInstallation();
    const result = await installGame(state.rootHandle, state.manifest, {
      baseUrl: import.meta.url,
      log: pushLog,
      overwriteExistingConfigs: reinstall,
      t,
    });

    pushLog(
      t("log.installComplete", {
        count: result.filesCopied,
        path: result.supportDirectory,
      }),
      "success",
    );
    if (result.packageUpdates === 0) {
      pushLog(t("log.noPackageNameChanges"), "info");
    }

    state.inspection = await inspectGameDirectory(state.rootHandle, { t });
    await refreshInstalledConfigSnapshot({ logOutcome: true });
  } catch (error) {
    pushLog(t("error.installationFailed", { message: error.message }), "error");
  } finally {
    state.busy = false;
    state.busyAction = null;
    render();
  }
}

async function handleSaveConfig() {
  const validationError = getConfigValidationError();
  if (validationError) {
    pushLog(t("error.saveConfigFailed", { message: validationError }), "error");
    render();
    return;
  }

  if (!canSaveConfig()) {
    return;
  }

  state.busy = true;
  state.busyAction = "save-config";
  render();

  try {
    const permissionGranted = await ensureReadWritePermission(state.rootHandle);
    if (!permissionGranted) {
      throw new Error(t("error.permissionDenied"));
    }

    const result = await saveInstalledConfigs(state.rootHandle, state.manifest, state.configDraft, { t });
    pushLog(
      t("log.configSaved", { path: result.supportDirectory }),
      "success",
    );

    await refreshInstalledConfigSnapshot({ logOutcome: false });
  } catch (error) {
    pushLog(t("error.saveConfigFailed", { message: error.message }), "error");
  } finally {
    state.busy = false;
    state.busyAction = null;
    render();
  }
}

function handleResetConfig() {
  if (!state.loadedConfigs || !state.configEditable) {
    return;
  }

  state.configDraft = cloneConfigSet(state.loadedConfigs);
  state.configErrors = new Set();
  renderConfigEditor();
  render();
  pushLog(t("log.resetConfig"), "info");
}

async function refreshInstalledConfigSnapshot(options = {}) {
  if (!state.manifest) {
    return;
  }

  const snapshot = await loadInstalledConfigs(state.rootHandle, state.manifest, { t });
  applyConfigSnapshot(snapshot, {
    logWarnings: options.logWarnings ?? true,
  });

  if (options.logOutcome ?? false) {
    pushLog(snapshot.reason, snapshot.editable ? "info" : "warning");
  }
}

function applyConfigSnapshot(snapshot, options = {}) {
  state.existingInstallationDetected = Boolean(snapshot.installed);
  state.loadedConfigs = snapshot.configs ? cloneConfigSet(snapshot.configs) : null;
  state.configDraft = snapshot.configs ? cloneConfigSet(snapshot.configs) : null;
  state.configEditable = Boolean(snapshot.editable);
  state.configAlertMessage = getConfigAlertMessage(snapshot);
  state.configStatusMessage = snapshot.reason;
  state.configErrors = new Set();

  renderConfigEditor();
  render();

  if (options.logWarnings ?? true) {
    for (const warning of snapshot.warnings) {
      pushLog(warning, "warning");
    }
  }
}

function supportsInstallation() {
  return window.isSecureContext && typeof window.showDirectoryPicker === "function";
}

function pushLog(message, tone = "info") {
  state.logs.push({
    message,
    tone,
  });
  renderLog();
}

function render() {
  renderVersionInfo();
  renderConfigAlert();
  renderSupportNote();
  renderFolderDetails();
  renderConfigStatus();
  renderLog();
  renderActionState();
}

function renderVersionInfo() {
  translatorVersion.textContent = t("page.version", {
    version: state.translatorVersion ?? t("folder.unknown"),
  });
}

function renderConfigAlert() {
  if (!state.configAlertMessage) {
    configAlert.textContent = "";
    configAlert.classList.remove("is-visible");
    return;
  }

  configAlert.textContent = state.configAlertMessage;
  configAlert.classList.add("is-visible");
}

function getConfigAlertMessage(snapshot) {
  if (snapshot.installed && !snapshot.editable && snapshot.reason) {
    return snapshot.reason;
  }

  return "";
}

function renderSupportNote() {
  if (!window.isSecureContext) {
    supportNote.textContent = t("support.secureContext");
    return;
  }

  if (typeof window.showDirectoryPicker !== "function") {
    supportNote.textContent = t("support.fileSystemApi");
    return;
  }

  if (!state.manifest) {
    supportNote.textContent = t("support.loadingBundle");
    return;
  }

  if (!state.rootHandle) {
    supportNote.textContent = t("support.selectFolder");
    return;
  }

  supportNote.textContent = state.inspection?.reason ?? t("support.readyToInspect");
}

function renderFolderDetails() {
  folderName.textContent = state.rootHandle?.name ?? t("folder.nothingSelected");
  folderStatus.textContent = state.inspection?.reason ?? t("folder.waitingForSelection");
  folderLayout.textContent = state.inspection?.layoutLabel ?? t("folder.unknown");
  pluginTarget.textContent = state.inspection?.pluginsDirPath ?? t("folder.unknown");
  pluginsFile.textContent = state.inspection?.pluginsFilePath ?? t("folder.unknown");

  packageList.textContent = "";

  const candidates = state.inspection?.packageCandidates ?? [];
  if (candidates.length === 0) {
    const item = document.createElement("li");
    item.textContent = t("package.noneInspected");
    packageList.append(item);
    return;
  }

  for (const candidate of candidates) {
    const item = document.createElement("li");
    item.textContent = `${candidate.path}: ${candidate.exists ? t("package.statusFound") : t("package.statusMissing")}`;
    packageList.append(item);
  }
}

function renderConfigStatus() {
  let message = state.configStatusMessage;
  const validationError = getConfigValidationError();

  if (state.configDraft) {
    if (!state.configEditable) {
      if (state.configAlertMessage) {
        configStatus.textContent = t("config.status.locked");
        return;
      }

      configStatus.textContent = message;
      return;
    }

    if (validationError) {
      message += ` ${t("config.status.error", { message: validationError })}`;
    } else if (state.configErrors.size > 0) {
      message += ` ${t(
        state.configErrors.size === 1
          ? "config.status.invalidNumber.one"
          : "config.status.invalidNumber.other",
        { count: state.configErrors.size },
      )}`;
    } else if (hasUnsavedConfigChanges()) {
      message += ` ${t("config.status.unsaved")}`;
    } else {
      message += ` ${t("config.status.clean")}`;
    }
  }

  configStatus.textContent = message;
}

function renderConfigEditor() {
  const editorLocked = Boolean(state.configDraft) && !state.configEditable;
  settingsConfigFields.classList.toggle("is-locked", editorLocked);
  translatorConfigFields.classList.toggle("is-locked", editorLocked);
  renderSettingsConfig(settingsConfigFields, state.configDraft?.settings);
  renderTranslatorConfig(translatorConfigFields, state.configDraft?.translator);
}

function renderSettingsConfig(container, config) {
  container.textContent = "";

  if (typeof config === "undefined") {
    const placeholder = document.createElement("p");
    placeholder.className = "config-empty";
    placeholder.textContent = t("config.empty");
    container.append(placeholder);
    return;
  }

  const section = document.createElement("section");
  section.className = "config-group";

  const heading = document.createElement("h4");
  heading.className = "config-group-title";
  heading.textContent = t("config.section.translation");
  section.append(heading);

  const fieldGrid = document.createElement("div");
  fieldGrid.className = "config-toggle-grid";
  fieldGrid.append(
    buildFieldInput(
      "settings",
      SETTINGS_FIELD,
      getValueAtPath(config, SETTINGS_FIELD.path),
    ),
  );

  section.append(fieldGrid);
  container.append(section);

  const gameMessageSection = document.createElement("section");
  gameMessageSection.className = "config-group";

  const gameMessageHeading = document.createElement("h4");
  gameMessageHeading.className = "config-group-title";
  gameMessageHeading.textContent = t("config.section.gameMessage");
  gameMessageSection.append(gameMessageHeading);

  const gameMessageFieldGrid = document.createElement("div");
  gameMessageFieldGrid.className = "config-field-grid";
  gameMessageFieldGrid.append(
    buildFieldInput(
      "settings",
      GAME_MESSAGE_TEXT_SCALE_FIELD,
      getValueAtPath(config, GAME_MESSAGE_TEXT_SCALE_FIELD.path),
    ),
  );

  gameMessageSection.append(gameMessageFieldGrid);
  container.append(gameMessageSection);
}

function renderTranslatorConfig(container, config) {
  container.textContent = "";

  if (typeof config === "undefined") {
    const placeholder = document.createElement("p");
    placeholder.className = "config-empty";
    placeholder.textContent = t("config.empty");
    container.append(placeholder);
    return;
  }

  const providerSection = document.createElement("section");
  providerSection.className = "config-group";

  const providerHeading = document.createElement("h4");
  providerHeading.className = "config-group-title";
  providerHeading.textContent = t("config.section.provider");
  providerSection.append(providerHeading);
  providerSection.append(buildProviderToggle(config));

  const provider = getSelectedProvider(config);
  if (provider === "none") {
    const providerNote = document.createElement("p");
    providerNote.className = "config-group-note";
    providerNote.textContent = t("config.section.noneSettings.note");
    providerSection.append(providerNote);
    container.append(providerSection);
    return;
  }

  container.append(providerSection);

  const settingsSection = document.createElement("section");
  settingsSection.className = "config-group";

  const settingsHeading = document.createElement("h4");
  settingsHeading.className = "config-group-title";
  settingsHeading.textContent = provider === "deepl"
    ? t("config.section.deeplSettings")
    : t("config.section.localSettings");
  settingsSection.append(settingsHeading);

  if (provider === "local") {
    const settingsNote = document.createElement("p");
    settingsNote.className = "config-group-note";
    settingsNote.textContent = t("config.section.localSettings.note");
    settingsSection.append(settingsNote);
  }

  const fieldGrid = document.createElement("div");
  fieldGrid.className = "config-field-grid";

  const activeFields = provider === "deepl" ? DEEPL_TRANSLATOR_FIELDS : LOCAL_TRANSLATOR_FIELDS;
  for (const field of activeFields) {
    fieldGrid.append(
      buildFieldInput(
        "translator",
        field,
        getValueAtPath(config, field.path),
      ),
    );
  }

  settingsSection.append(fieldGrid);
  container.append(settingsSection);
}

function buildProviderToggle(config) {
  const provider = getSelectedProvider(config);
  const group = document.createElement("div");
  group.className = "config-radio-group";

  for (const option of [
    { value: "local", label: "local", tooltipKey: "provider.local.tooltip" },
    { value: "deepl", label: "deepl", tooltipKey: "provider.deepl.tooltip" },
    { value: "none", label: "none", tooltipKey: "provider.none.tooltip" },
  ]) {
    const label = document.createElement("label");
    label.className = "config-radio-option";
    label.title = t(option.tooltipKey);

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "translator-provider";
    input.value = option.value;
    input.checked = provider === option.value;
    input.disabled = !state.configEditable;
    input.addEventListener("change", () => {
      setValueAtPath(state.configDraft.translator, ["provider"], option.value);
      clearConfigErrorsByPrefix("translator:");
      renderConfigEditor();
      renderConfigStatus();
      renderActionState();
    });

    const text = document.createElement("code");
    text.textContent = option.label;
    text.title = t(option.tooltipKey);

    label.append(input, text);
    group.append(label);
  }

  return group;
}

function buildFieldInput(configKey, field, currentValue) {
  const wrapper = document.createElement("div");
  wrapper.className = "config-field";
  if (field.inputKind === "checkbox") {
    wrapper.classList.add("checkbox-field");
  }
  const errorKey = `${configKey}:${field.id}`;

  const inputId = `${configKey}-${field.id.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "value"}`;
  if (field.inputKind === "checkbox") {
    const label = document.createElement("label");
    label.className = "config-toggle-option";
    label.setAttribute("for", inputId);
    label.title = getFieldTooltipText(field);

    const input = document.createElement("input");
    input.id = inputId;
    input.type = "checkbox";
    input.checked = Boolean(currentValue);
    input.disabled = !state.configEditable;
    input.addEventListener("change", () => {
      setValueAtPath(state.configDraft[configKey], field.path, input.checked);
      clearFieldError(errorKey, input);
      renderConfigStatus();
      renderActionState();
    });

    const text = document.createElement("code");
    text.textContent = field.label;
    text.title = getFieldTooltipText(field);

    label.append(input, text);
    wrapper.append(label);

    if (field.descriptionKey) {
      const description = document.createElement("p");
      description.className = "config-field-description";
      description.textContent = t(field.descriptionKey);
      wrapper.append(description);
    }

    return wrapper;
  }

  const label = document.createElement("label");
  label.className = "config-label";
  label.setAttribute("for", inputId);
  label.title = getFieldTooltipText(field);

  const pathText = document.createElement("code");
  pathText.textContent = field.label;
  pathText.title = getFieldTooltipText(field);
  label.append(pathText);
  wrapper.append(label);

  const input = createFieldControl(field, inputId, currentValue);
  input.title = getFieldTooltipText(field);
  input.disabled = !state.configEditable;
  if (hasFieldValidationError(configKey, field)) {
    input.setAttribute("aria-invalid", "true");
  }
  attachFieldHandler(configKey, field, input);
  wrapper.append(input);

  const fieldValidationError = getFieldValidationError(configKey, field);
  if (fieldValidationError) {
    const errorText = document.createElement("p");
    errorText.className = "config-field-error";
    errorText.textContent = fieldValidationError;
    wrapper.append(errorText);
  }

  if (field.descriptionKey) {
    const description = document.createElement("p");
    description.className = "config-field-description";
    description.textContent = t(field.descriptionKey);
    wrapper.append(description);
  }

  return wrapper;
}

function createFieldControl(field, inputId, currentValue) {
  if (field.inputKind === "textarea") {
    const textarea = document.createElement("textarea");
    textarea.id = inputId;
    textarea.rows = getTextareaRows(currentValue);
    textarea.value = String(currentValue ?? "");
    textarea.spellcheck = false;
    return textarea;
  }

  const input = document.createElement("input");
  input.id = inputId;
  input.spellcheck = false;

  if (field.inputKind === "number") {
    input.type = "number";
    input.step = field.integer ? "1" : "any";
    if (typeof field.min === "number") {
      input.min = String(field.min);
    }
    if (typeof field.max === "number") {
      input.max = String(field.max);
    }
    input.value = typeof currentValue === "undefined" ? "" : String(currentValue);
    return input;
  }

  input.type = field.inputKind === "secret" ? "password" : "text";
  input.autocomplete = field.inputKind === "secret" || field.inputKind === "sensitive-text"
    ? "new-password"
    : "off";
  input.value = String(currentValue ?? "");
  return input;
}

function attachFieldHandler(configKey, field, input) {
  const errorKey = `${configKey}:${field.id}`;
  if (field.inputKind === "number") {
    input.addEventListener("input", () => {
      const value = input.value.trim();
      if (value === "") {
        markFieldInvalid(errorKey, input);
        return;
      }

      const parsed = Number(value);
      if (Number.isNaN(parsed)) {
        markFieldInvalid(errorKey, input);
        return;
      }

      setValueAtPath(state.configDraft[configKey], field.path, parsed);
      if (!isFieldNumberValueValid(field, parsed)) {
        markFieldInvalid(errorKey, input);
        renderConfigStatus();
        renderActionState();
        return;
      }

      clearFieldError(errorKey, input);
      renderConfigStatus();
      renderActionState();
    });
    return;
  }

  input.addEventListener("input", () => {
    setValueAtPath(state.configDraft[configKey], field.path, input.value);
    clearFieldError(errorKey, input);
    renderConfigStatus();
    renderActionState();
  });
}

function markFieldInvalid(fieldId, input) {
  state.configErrors.add(fieldId);
  input.setAttribute("aria-invalid", "true");
  renderConfigStatus();
  renderActionState();
}

function clearFieldError(fieldId, input) {
  state.configErrors.delete(fieldId);
  input.removeAttribute("aria-invalid");
}

function clearConfigErrorsByPrefix(prefix) {
  state.configErrors = new Set(
    [...state.configErrors].filter((fieldId) => !fieldId.startsWith(prefix)),
  );
}

function getFieldTooltipText(field) {
  if (field.tooltipKey) {
    return t(field.tooltipKey);
  }

  if (field.descriptionKey) {
    return t(field.descriptionKey);
  }

  return field.label;
}

function renderLog() {
  logList.textContent = "";

  const entries = state.logs.length > 0
    ? state.logs
    : [{ message: t("log.waitingForBundle"), tone: "info" }];

  for (const entry of entries) {
    const item = document.createElement("li");
    item.className = `log-entry ${entry.tone}`;
    item.textContent = entry.message;
    logList.append(item);
  }
}

function renderActionState() {
  pickFolderButton.disabled = state.busy || !supportsInstallation();
  installButton.disabled = state.busy || !canInstall();
  saveConfigButton.disabled = state.busy || !canSaveConfig();
  resetConfigButton.disabled = state.busy || !canResetConfig();
  const reinstall = hasExistingInstallation();

  pickFolderButton.title = t("tooltip.pickFolderButton");
  installButton.title = t(reinstall ? "tooltip.reinstallButton" : "tooltip.installButton");
  saveConfigButton.title = t("tooltip.saveConfigButton");
  resetConfigButton.title = t("tooltip.resetConfigButton");

  installButton.textContent = state.busyAction === "install"
    ? t(reinstall ? "button.reinstalling" : "button.installing")
    : t(reinstall ? "button.reinstall" : "button.install");
  saveConfigButton.textContent = state.busyAction === "save-config"
    ? t("button.saving")
    : t("button.saveConfig");
  resetConfigButton.textContent = t("button.resetConfig");
}

function canInstall() {
  return Boolean(
    state.manifest
      && state.rootHandle
      && state.inspection?.valid
      && supportsInstallation(),
  );
}

function canSaveConfig() {
  return Boolean(
    state.manifest
      && state.rootHandle
      && state.inspection?.valid
      && state.loadedConfigs
      && state.configDraft
      && state.configEditable
      && state.configErrors.size === 0
      && !getConfigValidationError()
      && hasUnsavedConfigChanges()
      && supportsInstallation(),
  );
}

function canResetConfig() {
  return Boolean(
    state.configEditable
      && hasUnsavedConfigChanges(),
  );
}

function hasUnsavedConfigChanges() {
  return Boolean(
    state.loadedConfigs
      && state.configDraft
      && !configDraftsEqual(state.loadedConfigs, state.configDraft),
  );
}

function hasExistingInstallation() {
  return Boolean(state.existingInstallationDetected);
}

function getSelectedProvider(config) {
  const provider = String(getValueAtPath(config, ["provider"]) ?? "").trim().toLowerCase();
  if (provider === "deepl" || provider === "local" || provider === "none") {
    return provider;
  }
  return "local";
}

function getConfigValidationError() {
  const settingsValidationError = getSettingsConfigValidationError();
  if (settingsValidationError) {
    return settingsValidationError;
  }

  return getTranslatorConfigValidationError();
}

function getTranslatorConfigValidationError() {
  if (!state.configDraft?.translator) {
    return null;
  }

  if (getSelectedProvider(state.configDraft.translator) !== "deepl") {
    return null;
  }

  const apiKey = String(getValueAtPath(state.configDraft.translator, ["settings", "deepl", "apiKey"]) ?? "");
  if (apiKey.includes(DEEPL_APIKEY_PLACEHOLDER_SUBSTRING)) {
    return t("error.deeplPlaceholder", { value: DEEPL_APIKEY_PLACEHOLDER_SUBSTRING });
  }

  return null;
}

function hasFieldValidationError(configKey, field) {
  return Boolean(getFieldValidationError(configKey, field));
}

function getFieldValidationError(configKey, field) {
  const config = state.configDraft?.[configKey];
  if (field.inputKind === "number" && config) {
    const value = getValueAtPath(config, field.path);
    if (typeof value !== "undefined" && !isFieldNumberValueValid(field, Number(value))) {
      return getNumberFieldValidationMessage(field);
    }
  }

  if (configKey === "translator" && field.id === "settings.deepl.apiKey") {
    return getTranslatorConfigValidationError();
  }

  return null;
}

function getSettingsConfigValidationError() {
  if (!state.configDraft?.settings) {
    return null;
  }

  const textScale = getValueAtPath(state.configDraft.settings, GAME_MESSAGE_TEXT_SCALE_FIELD.path);
  if (typeof textScale === "undefined") {
    return null;
  }

  return isFieldNumberValueValid(GAME_MESSAGE_TEXT_SCALE_FIELD, Number(textScale))
    ? null
    : getNumberFieldValidationMessage(GAME_MESSAGE_TEXT_SCALE_FIELD);
}

function isFieldNumberValueValid(field, value) {
  return validateNumberValue(value, {
    integer: field.integer,
    min: field.min,
    max: field.max,
  });
}

function getNumberFieldValidationMessage(field) {
  if (field.validationMessageKey) {
    return t(field.validationMessageKey, {
      min: field.min,
      max: field.max,
    });
  }

  return t("config.status.invalidNumber.one");
}

function getTextareaRows(value) {
  const text = String(value ?? "");
  if (text.includes("\n")) {
    return Math.min(8, text.split("\n").length + 1);
  }

  return text.length > 160 ? 5 : 3;
}
