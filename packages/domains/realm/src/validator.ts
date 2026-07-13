import { isRecord } from "./guards";
import {
  RealmAgentAuthMode,
  RealmTwoFactorRequirement,
  cloneDefaultRealmFeatures,
  type RealmFeatures
} from "./model";
import type { SocialProviderPatch } from "./social-provider-store";

export type RealmSettingsPatch = {
  name: string;
  description: string;
  iconUrl: string;
  appUrl: string;
  trustedOrigins: string[];
  features: RealmFeatures;
};

export type RealmSettingsCreate = Omit<RealmSettingsPatch, "features"> & {
  slug: string;
  features?: RealmFeatures;
};

type RealmCreateBody = Partial<Record<keyof RealmSettingsCreate, unknown>>;
type RealmSettingsBody = Partial<Record<keyof RealmSettingsPatch, unknown>>;
type SocialProviderBody = {
  enabled?: unknown;
  clientId?: unknown;
  clientSecret?: unknown;
};

export const parseRealmCreate = (body: RealmCreateBody) => {
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
    features: normalizeRealmFeatures(body.features)
  };
};

export const parseRealmSettingsPatch = (body: RealmSettingsBody) => {
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
    features: normalizeRealmFeatures(body.features)
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

export const validateRealmSettingsPatch = (patch: RealmSettingsPatch) => {
  if (patch.name.trim().length === 0) {
    throw new Error("Project name is required");
  }

  validateOptionalUrl(patch.iconUrl, "iconUrl");
  validateOptionalUrl(patch.appUrl, "appUrl");

  const seen = new Set<string>();
  for (const origin of patch.trustedOrigins) {
    validateOrigin(origin);
    if (seen.has(origin)) {
      throw new Error(`Duplicate trusted origin: ${origin}`);
    }
    seen.add(origin);
  }
};

export const normalizeRealmFeatures = (value: unknown) => {
  if (!isRecord(value)) {
    return cloneDefaultRealmFeatures();
  }

  const passkey = isRecord(value.passkey) ? value.passkey : {};
  const twoFactor = isRecord(value.twoFactor) ? value.twoFactor : {};
  const agentAuth = isRecord(value.agentAuth) ? value.agentAuth : {};
  const oauthProvider = isRecord(value.oauthProvider) ? value.oauthProvider : {};

  const required = twoFactor.required;
  const mode = agentAuth.mode;
  const oauthProviderEnabled =
    typeof oauthProvider.enabled === "boolean" ? oauthProvider.enabled : false;

  return {
    passkey: {
      enabled: typeof passkey.enabled === "boolean" ? passkey.enabled : false
    },
    twoFactor: {
      enabled: typeof twoFactor.enabled === "boolean" ? twoFactor.enabled : false,
      required:
        required === RealmTwoFactorRequirement.Admins ||
        required === RealmTwoFactorRequirement.Everyone ||
        required === RealmTwoFactorRequirement.Optional
          ? required
          : RealmTwoFactorRequirement.Optional
    },
    agentAuth: {
      enabled: typeof agentAuth.enabled === "boolean" ? agentAuth.enabled : false,
      mode:
        mode === RealmAgentAuthMode.ScopedWrite ||
        mode === RealmAgentAuthMode.ReadOnly
          ? mode
          : RealmAgentAuthMode.ReadOnly
    },
    oauthProvider: {
      enabled: oauthProviderEnabled,
      dynamicClientRegistration:
        oauthProviderEnabled &&
        typeof oauthProvider.dynamicClientRegistration === "boolean"
          ? oauthProvider.dynamicClientRegistration
          : false
    }
  };
};

const validateOptionalUrl = (value: string, field: string) => {
  if (!value) {
    return;
  }

  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error();
    }
  } catch {
    throw new Error(`Invalid ${field}`);
  }
};

const validateOrigin = (value: string) => {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== value) {
      throw new Error();
    }
  } catch {
    throw new Error(`Invalid trusted origin: ${value}`);
  }
};
