type LogLevel = "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

const SECRET_FIELD_PATTERN = /(secret|token|password|key|authorization|cookie)/i;

export const logInfo = (message: string, fields: LogFields = {}) => {
  writeLog("info", message, fields);
};

export const logWarn = (message: string, fields: LogFields = {}) => {
  writeLog("warn", message, fields);
};

export const logError = (message: string, fields: LogFields = {}) => {
  writeLog("error", message, fields);
};

export const auditLog = (
  action: string,
  fields: LogFields & {
    actorId?: string;
    actorEmail?: string;
    projectSlug?: string;
  } = {}
) => {
  writeLog("info", "audit", {
    action,
    ...fields
  });
};

const writeLog = (level: LogLevel, message: string, fields: LogFields) => {
  const payload = {
    level,
    message,
    time: new Date().toISOString(),
    ...redactFields(fields)
  };

  const serialized = JSON.stringify(payload);
  if (level === "error") {
    console.error(serialized);
    return;
  }
  if (level === "warn") {
    console.warn(serialized);
    return;
  }
  console.info(serialized);
};

const redactFields = (fields: LogFields) => {
  const redacted: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    redacted[key] = SECRET_FIELD_PATTERN.test(key) ? "[redacted]" : value;
  }
  return redacted;
};
