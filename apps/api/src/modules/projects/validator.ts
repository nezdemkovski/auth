import {
  normalizeProjectFeatures,
  type ProjectSettingsCreate,
  type ProjectSettingsPatch
} from "./store";
import type { SocialProviderPatch } from "./social-provider-store";

type ProjectCreateBody = Partial<Record<keyof ProjectSettingsCreate, unknown>>;
type ProjectSettingsBody = Partial<Record<keyof ProjectSettingsPatch, unknown>>;
type SocialProviderBody = {
  enabled?: unknown;
  clientId?: unknown;
  clientSecret?: unknown;
};

export const parseProjectCreate = (body: ProjectCreateBody) => {
  if (
    typeof body.slug !== "string" ||
    typeof body.name !== "string" ||
    typeof body.description !== "string" ||
    typeof body.iconUrl !== "string" ||
    typeof body.appUrl !== "string" ||
    !Array.isArray(body.trustedOrigins) ||
    !body.trustedOrigins.every((origin) => typeof origin === "string")
  ) {
    return null;
  }

  return {
    slug: body.slug.trim(),
    name: body.name.trim(),
    description: body.description.trim(),
    iconUrl: body.iconUrl.trim(),
    appUrl: body.appUrl.trim(),
    trustedOrigins: body.trustedOrigins.map((origin) => origin.trim()).filter(Boolean),
    features: normalizeProjectFeatures(body.features)
  };
};

export const parseProjectSettingsPatch = (body: ProjectSettingsBody) => {
  if (
    typeof body.name !== "string" ||
    typeof body.description !== "string" ||
    typeof body.iconUrl !== "string" ||
    typeof body.appUrl !== "string" ||
    !Array.isArray(body.trustedOrigins) ||
    !body.trustedOrigins.every((origin) => typeof origin === "string")
  ) {
    return null;
  }

  return {
    name: body.name.trim(),
    description: body.description.trim(),
    iconUrl: body.iconUrl.trim(),
    appUrl: body.appUrl.trim(),
    trustedOrigins: body.trustedOrigins.map((origin) => origin.trim()).filter(Boolean),
    features: normalizeProjectFeatures(body.features)
  };
};

export const parseSocialProviderPatch = (body: SocialProviderBody) => {
  if (typeof body.enabled !== "boolean" || typeof body.clientId !== "string") {
    return null;
  }

  const patch: SocialProviderPatch = {
    enabled: body.enabled,
    clientId: body.clientId.trim()
  };

  if (typeof body.clientSecret === "string" && body.clientSecret.trim().length > 0) {
    patch.clientSecret = body.clientSecret.trim();
  }

  return patch;
};
