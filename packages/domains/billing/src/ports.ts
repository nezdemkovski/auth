export type BillingSubjectDirectory = {
  exists(subject: string): Promise<boolean>;
};

export type BillingLogger = {
  info(event: string, fields: Record<string, unknown>): void;
  warn(event: string, fields: Record<string, unknown>): void;
  error(event: string, fields: Record<string, unknown>): void;
};
