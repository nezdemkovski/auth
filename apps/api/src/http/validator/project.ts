import {
  normalizeProjectFeatures,
  type ProjectSettingsCreate,
  type ProjectSettingsPatch
} from "../../db/project-settings";
import type { SocialProviderPatch } from "../../db/social-provider-settings";

type ProjectCreateBody = Partial<Record<keyof ProjectSettingsCreate, unknown>>;
type ProjectSettingsBody = Partial<Record<keyof ProjectSettingsPatch, unknown>>;
type SocialProviderBody = {
  enabled?: unknown;
  clientId?: unknown;
  clientSecret?: unknown;
};

export function parseProjectCreate(
  body: ProjectCreateBody
): ProjectSettingsCreate | null {
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
}

export function parseProjectSettingsPatch(
  body: ProjectSettingsBody
): ProjectSettingsPatch | null {
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
}

export function parseSocialProviderPatch(
  body: SocialProviderBody
): SocialProviderPatch | null {
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
}
