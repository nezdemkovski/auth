export enum AuthConnectionKind {
  Application = "application",
  Service = "service",
  Advanced = "advanced"
}

export enum ServicePermission {
  BillingUsageWrite = "billing_usage_write"
}

export type CreateApplicationConnectionInput = {
  kind: AuthConnectionKind.Application;
  name: string;
  backendUrl: string;
};

export type CreateServiceConnectionInput = {
  kind: AuthConnectionKind.Service;
  name: string;
  permissions: ServicePermission[];
};

export type CreateAuthConnectionInput =
  | CreateApplicationConnectionInput
  | CreateServiceConnectionInput;

export type UpdateAuthConnectionInput = {
  name: string;
};
