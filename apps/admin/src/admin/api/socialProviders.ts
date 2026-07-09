import type {
  SocialProviderId,
  SocialProviderPatch,
  SocialProvidersResponse
} from "../types";
import { adminFetch, jsonHeaders, readJson } from "./shared";

export async function fetchSocialProviders(
  project: string
): Promise<SocialProvidersResponse> {
  const response = await adminFetch(`/admin/api/projects/${project}/social-providers`, {
    credentials: "include"
  });
  if (!response.ok) throw new Error("Could not load social providers");
  return readJson<SocialProvidersResponse>(response);
}

export async function updateSocialProvider(input: {
  project: string;
  provider: SocialProviderId;
  patch: SocialProviderPatch;
}): Promise<SocialProvidersResponse> {
  const response = await adminFetch(
    `/admin/api/projects/${input.project}/social-providers/${input.provider}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: jsonHeaders,
      body: JSON.stringify(input.patch)
    }
  );
  if (!response.ok) throw new Error("Could not save social provider");
  return readJson<SocialProvidersResponse>(response);
}

export async function verifySocialProvider(input: {
  project: string;
  provider: SocialProviderId;
}): Promise<SocialProvidersResponse> {
  const response = await adminFetch(
    `/admin/api/projects/${input.project}/social-providers/${input.provider}/verify`,
    {
      method: "POST",
      credentials: "include"
    }
  );
  if (!response.ok) throw new Error("Could not verify social provider");
  return readJson<SocialProvidersResponse>(response);
}
