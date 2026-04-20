export function cloneConfigSet(configs) {
  return JSON.parse(JSON.stringify(configs));
}

export function configDraftsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function getValueAtPath(target, path) {
  let current = target;
  for (const segment of path) {
    if (current === null || typeof current === "undefined") {
      return undefined;
    }
    current = current[segment];
  }

  return current;
}

export function buildConfigGroups(config) {
  if (!isContainer(config)) {
    return [{
      id: "general",
      label: "General",
      fields: [createField([], config)],
    }];
  }

  const groups = [];
  const rootFields = [];

  for (const [key, value] of Object.entries(config)) {
    if (isPrimitive(value)) {
      rootFields.push(createField([key], value));
      continue;
    }

    const fields = collectFields(value, [key], []);
    if (fields.length > 0) {
      groups.push({
        id: key,
        label: key,
        fields,
      });
    }
  }

  if (rootFields.length > 0) {
    groups.unshift({
      id: "general",
      label: "General",
      fields: rootFields,
    });
  }

  return groups;
}

export function setValueAtPath(target, path, value) {
  if (path.length === 0) {
    return value;
  }

  let current = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    if (current[segment] === null || typeof current[segment] === "undefined") {
      current[segment] = typeof path[index + 1] === "number" ? [] : {};
    }
    current = current[segment];
  }

  current[path[path.length - 1]] = value;
  return target;
}

export function validateNumberValue(value, options = {}) {
  if (!Number.isFinite(value)) {
    return false;
  }

  if (options.integer && !Number.isInteger(value)) {
    return false;
  }

  if (typeof options.min === "number" && value < options.min) {
    return false;
  }

  if (typeof options.max === "number" && value > options.max) {
    return false;
  }

  return true;
}

function collectFields(value, absolutePath, relativePath) {
  if (isPrimitive(value)) {
    return [createField(absolutePath, value, relativePath)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => (
      collectFields(item, [...absolutePath, index], [...relativePath, index])
    ));
  }

  if (isContainer(value)) {
    return Object.entries(value).flatMap(([key, childValue]) => (
      collectFields(childValue, [...absolutePath, key], [...relativePath, key])
    ));
  }

  return [createField(absolutePath, value, relativePath)];
}

function createField(path, value, relativePath = path) {
  const label = formatPath(relativePath);
  return {
    id: formatPath(path),
    inputKind: inferInputKind(path, value),
    label,
    path,
    value,
  };
}

function inferInputKind(path, value) {
  if (typeof value === "boolean") {
    return "checkbox";
  }

  if (typeof value === "number") {
    return "number";
  }

  if (typeof value === "string") {
    const pathLabel = formatPath(path);
    if (/(api.?key|token|secret|password)/i.test(pathLabel)) {
      return "secret";
    }

    if (value.includes("\n") || value.length > 72 || /(prompt|regex)/i.test(pathLabel)) {
      return "textarea";
    }

    return "text";
  }

  return "text";
}

function formatPath(path) {
  if (path.length === 0) {
    return "value";
  }

  return path.reduce((label, segment) => (
    typeof segment === "number"
      ? `${label}[${segment}]`
      : label
        ? `${label}.${segment}`
        : segment
  ), "");
}

function isContainer(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPrimitive(value) {
  return value === null || typeof value !== "object";
}
