import type {
  CreateProjectInput,
  BillingSettings,
  BillingProductMapping,
  BillingSettingsPatch,
  CreatePolarProductInput,
  DeliverySettings,
  DeliverySettingsPatch,
  MeResponse,
  ProjectSettingsPatch,
  SocialProviderId,
  SocialProviderPatch,
  SocialProvidersResponse,
  PolarProductsResponse,
  ProjectSummary,
  ProjectUsersResponse,
  ProjectsResponse
} from "./types";

export const jsonHeaders = {
  "Content-Type": "application/json"
};

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}

export async function fetchMe(): Promise<MeResponse> {
  const response = await fetch("/admin/api/me", { credentials: "include" });
  if (response.status === 401) throw new UnauthorizedError();
  if (!response.ok) throw new Error("Admin API is unavailable");
  return (await response.json()) as MeResponse;
}

export async function signInAdmin(input: {
  email: string;
  password: string;
}): Promise<void> {
  const response = await fetch("/api/admin/auth/sign-in/email", {
    method: "POST",
    credentials: "include",
    headers: jsonHeaders,
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw new Error("Invalid email or password");
  }
}

export async function fetchProjects(): Promise<ProjectsResponse> {
  const response = await fetch("/admin/api/projects", { credentials: "include" });
  if (!response.ok) throw new Error("Could not load projects");
  return (await response.json()) as ProjectsResponse;
}

export async function fetchDeliverySettings(): Promise<DeliverySettings> {
  const response = await fetch("/admin/api/delivery-settings", {
    credentials: "include"
  });
  if (!response.ok) throw new Error("Could not load delivery settings");
  return ((await response.json()) as { settings: DeliverySettings }).settings;
}

export async function updateDeliverySettings(
  patch: DeliverySettingsPatch
): Promise<DeliverySettings> {
  const response = await fetch("/admin/api/delivery-settings", {
    method: "PATCH",
    credentials: "include",
    headers: jsonHeaders,
    body: JSON.stringify(patch)
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Could not save delivery settings");
  }

  return ((await response.json()) as { settings: DeliverySettings }).settings;
}

export async function verifyDeliverySettings(): Promise<void> {
  const response = await fetch("/admin/api/delivery-settings/verify", {
    method: "POST",
    credentials: "include"
  });
  if (!response.ok) throw new Error("Could not send test email");
}

export async function fetchBillingSettings(project: string): Promise<BillingSettings> {
  const response = await fetch(`/admin/api/projects/${project}/billing`, {
    credentials: "include"
  });
  if (!response.ok) throw new Error("Could not load billing settings");
  return ((await response.json()) as { settings: BillingSettings }).settings;
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
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Could not save billing settings");
  }

  return ((await response.json()) as { settings: BillingSettings }).settings;
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
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Could not verify Polar settings");
  }
}

export async function fetchPolarProducts(project: string): Promise<PolarProductsResponse> {
  const response = await fetch(`/admin/api/projects/${project}/billing/polar-products`, {
    credentials: "include"
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Could not load Polar products");
  }
  return (await response.json()) as PolarProductsResponse;
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
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Could not create Polar product");
  }

  return ((await response.json()) as { product: BillingProductMapping }).product;
}

export async function createProject(input: CreateProjectInput): Promise<ProjectSummary> {
  const response = await fetch("/admin/api/projects", {
    method: "POST",
    credentials: "include",
    headers: jsonHeaders,
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    if (body?.error === "project_exists") {
      throw new Error("A project with this slug already exists");
    }
    throw new Error(body?.message ?? "Could not create project");
  }

  return ((await response.json()) as { project: ProjectSummary }).project;
}

export async function fetchSocialProviders(
  project: string
): Promise<SocialProvidersResponse> {
  const response = await fetch(`/admin/api/projects/${project}/social-providers`, {
    credentials: "include"
  });
  if (!response.ok) throw new Error("Could not load social providers");
  return (await response.json()) as SocialProvidersResponse;
}

export async function updateSocialProvider(input: {
  project: string;
  provider: SocialProviderId;
  patch: SocialProviderPatch;
}): Promise<SocialProvidersResponse> {
  const response = await fetch(
    `/admin/api/projects/${input.project}/social-providers/${input.provider}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: jsonHeaders,
      body: JSON.stringify(input.patch)
    }
  );
  if (!response.ok) throw new Error("Could not save social provider");
  return (await response.json()) as SocialProvidersResponse;
}

export async function verifySocialProvider(input: {
  project: string;
  provider: SocialProviderId;
}): Promise<SocialProvidersResponse> {
  const response = await fetch(
    `/admin/api/projects/${input.project}/social-providers/${input.provider}/verify`,
    {
      method: "POST",
      credentials: "include"
    }
  );
  if (!response.ok) throw new Error("Could not verify social provider");
  return (await response.json()) as SocialProvidersResponse;
}

export async function fetchProjectUsers(project: string): Promise<ProjectUsersResponse> {
  const response = await fetch(`/admin/api/projects/${project}/users`, {
    credentials: "include"
  });
  if (!response.ok) throw new Error("Could not load users");
  return (await response.json()) as ProjectUsersResponse;
}

export async function resendVerificationEmail(project: string, email: string): Promise<void> {
  const response = await fetch(
    `/admin/api/projects/${project}/users/resend-verification`,
    {
      method: "POST",
      credentials: "include",
      headers: jsonHeaders,
      body: JSON.stringify({ email })
    }
  );
  if (!response.ok) throw new Error("Could not send verification email");
}

export async function terminateUserSessions(project: string, userId: string): Promise<void> {
  const response = await fetch(
    `/admin/api/projects/${project}/users/${userId}/terminate-sessions`,
    {
      method: "POST",
      credentials: "include"
    }
  );

  if (!response.ok) throw new Error("Could not terminate sessions");
}

export async function updateProjectSettings(
  project: string,
  patch: ProjectSettingsPatch
): Promise<ProjectSummary> {
  const response = await fetch(`/admin/api/projects/${project}`, {
    method: "PATCH",
    credentials: "include",
    headers: jsonHeaders,
    body: JSON.stringify(patch)
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Could not save project settings");
  }

  return ((await response.json()) as { project: ProjectSummary }).project;
}

export async function updateAdminProfile(patch: {
  name?: string;
  email?: string;
  currentPassword?: string;
}): Promise<void> {
  const response = await fetch("/admin/api/profile", {
    method: "PATCH",
    credentials: "include",
    headers: jsonHeaders,
    body: JSON.stringify(patch)
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (data?.error === "email_in_use") throw new Error("Email is already in use");
    if (data?.error === "invalid_email") throw new Error("Invalid email address");
    if (data?.error === "invalid_name") throw new Error("Invalid name");
    if (data?.error === "current_password_required") {
      throw new Error("Current password is required to change email");
    }
    if (data?.error === "invalid_password") throw new Error("Current password is incorrect");
    if (data?.error === "email_service_disabled") {
      throw new Error("Configure email delivery before changing email");
    }
    if (data?.error === "no_changes") throw new Error("Nothing to save");
    throw new Error("Could not save profile");
  }
}

export async function changeAdminPassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const response = await fetch("/admin/api/change-password", {
    method: "POST",
    credentials: "include",
    headers: jsonHeaders,
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    if (response.status === 400) {
      throw new Error("Use a password with at least 12 characters");
    }
    throw new Error("Could not change password");
  }
}

export async function signOut(): Promise<void> {
  await fetch("/api/admin/auth/sign-out", {
    method: "POST",
    credentials: "include"
  }).catch(() => {});
}
