export enum PostgresErrorCode {
  UniqueViolation = "23505"
}

export const isPostgresUniqueViolation = (error: unknown) => {
  if (!isRecord(error)) {
    return false;
  }

  return (
    error.code === PostgresErrorCode.UniqueViolation ||
    (isRecord(error.cause) &&
      error.cause.code === PostgresErrorCode.UniqueViolation)
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};
