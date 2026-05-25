import {
  DEFAULT_PROJECT_FEATURES,
  ProjectAgentAuthMode,
  ProjectTwoFactorRequirement,
  type ProjectFeatures
} from "../../config/projects";
import { isRecord } from "../../runtime/type-guards";
import type { SocialProviderPatch } from "./social-provider-store";

export type ProjectSettingsPatch = {
  name: string;
  description: string;
  iconUrl: string;
  appUrl: string;
  trustedOrigins: string[];
  features: ProjectFeatures;
};

export type ProjectSettingsCreate = Omit<ProjectSettingsPatch, "features"> & {
  slug: string;
  features?: ProjectFeatures;
};

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

export const validateProjectSettingsPatch = (patch: ProjectSettingsPatch) => {
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

export const normalizeProjectFeatures = (value: unknown) => {
  if (!isRecord(value)) {
    return cloneDefaultFeatures();
  }

  const passkey = isRecord(value.passkey) ? value.passkey : {};
  const twoFactor = isRecord(value.twoFactor) ? value.twoFactor : {};
  const agentAuth = isRecord(value.agentAuth) ? value.agentAuth : {};
  const oauthProvider = isRecord(value.oauthProvider) ? value.oauthProvider : {};

  const required = twoFactor.required;
  const mode = agentAuth.mode;

  return {
    passkey: {
      enabled: typeof passkey.enabled === "boolean" ? passkey.enabled : false
    },
    twoFactor: {
      enabled: typeof twoFactor.enabled === "boolean" ? twoFactor.enabled : false,
      required:
        required === ProjectTwoFactorRequirement.Admins ||
        required === ProjectTwoFactorRequirement.Everyone ||
        required === ProjectTwoFactorRequirement.Optional
          ? required
          : ProjectTwoFactorRequirement.Optional
    },
    agentAuth: {
      enabled: typeof agentAuth.enabled === "boolean" ? agentAuth.enabled : false,
      mode:
        mode === ProjectAgentAuthMode.ScopedWrite ||
        mode === ProjectAgentAuthMode.ReadOnly
          ? mode
          : ProjectAgentAuthMode.ReadOnly
    },
    oauthProvider: {
      enabled:
        typeof oauthProvider.enabled === "boolean" ? oauthProvider.enabled : false,
      dynamicClientRegistration:
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

const cloneDefaultFeatures = () => {
  return {
    passkey: {
      ...DEFAULT_PROJECT_FEATURES.passkey
    },
    twoFactor: {
      ...DEFAULT_PROJECT_FEATURES.twoFactor
    },
    agentAuth: {
      ...DEFAULT_PROJECT_FEATURES.agentAuth
    },
    oauthProvider: {
      ...DEFAULT_PROJECT_FEATURES.oauthProvider
    }
  };
};
