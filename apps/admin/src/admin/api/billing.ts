import type {
  BillingProductMapping,
  BillingSettings,
  BillingSettingsPatch,
  CreatePolarProductInput,
  PolarProductsResponse
} from "../types";
import { jsonHeaders, readErrorMessage, readJson } from "./shared";

export async function fetchBillingSettings(project: string): Promise<BillingSettings> {
  const response = await fetch(`/admin/api/projects/${project}/billing`, {
    credentials: "include"
  });
  if (!response.ok) throw new Error("Could not load billing settings");
  return (await readJson<{ settings: BillingSettings }>(response)).settings;
}

export async function updateBillingSettings(input: {
  project: string;
  patch: BillingSettingsPatch;
}): Promise<BillingSettings> {
  const response = await fetch(`/admin/api/projects/${input.project}/billing`, {
    method: "PATCH",
    credentials: "include",
    headers: jsonHeaders,
    body: JSON.stringify(input.patch)
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not save billing settings"));
  }

  return (await readJson<{ settings: BillingSettings }>(response)).settings;
}

export async function verifyBillingSettings(input: {
  project: string;
  accessToken?: string;
  environment?: BillingSettings["environment"];
}): Promise<void> {
  const response = await fetch(`/admin/api/projects/${input.project}/billing/verify`, {
    method: "POST",
    credentials: "include",
    headers: jsonHeaders,
    body: JSON.stringify({
      ...(input.accessToken ? { accessToken: input.accessToken } : {}),
      ...(input.environment ? { environment: input.environment } : {})
    })
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not verify Polar settings"));
  }
}

export async function fetchPolarProducts(project: string): Promise<PolarProductsResponse> {
  const response = await fetch(`/admin/api/projects/${project}/billing/polar-products`, {
    credentials: "include"
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not load Polar products"));
  }
  return readJson<PolarProductsResponse>(response);
}

export async function createPolarProduct(input: {
  project: string;
  product: CreatePolarProductInput;
}): Promise<BillingProductMapping> {
  const response = await fetch(
    `/admin/api/projects/${input.project}/billing/polar-products`,
    {
      method: "POST",
      credentials: "include",
      headers: jsonHeaders,
      body: JSON.stringify(input.product)
    }
  );

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not create Polar product"));
  }

  return (await readJson<{ product: BillingProductMapping }>(response)).product;
}
