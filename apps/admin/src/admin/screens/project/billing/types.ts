export type BillingView = "setup" | "products";

export type ProductWorkspace =
  | { mode: "product"; index: number }
  | { mode: "create" };
