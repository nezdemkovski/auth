import {
  cloneDefaultRealmFeatures,
  type RealmSettingsCreate
} from "@nezdemkovski/auth-realm";

import { isRecord } from "../../runtime/type-guards";

export type ProjectCreateInput = {
  realm: RealmSettingsCreate;
  backendUrl: string;
};

export const parseProjectCreate = (value: unknown): ProjectCreateInput | null => {
  if (!isRecord(value)) {
    return null;
  }

  const slug = parseRequiredText(value.slug);
  const name = parseRequiredText(value.name);
  const appUrl = parseOrigin(value.appUrl);
  const backendUrl = parseOrigin(value.backendUrl);
  if (!slug || !name || !appUrl || !backendUrl) {
    return null;
  }

  const features = cloneDefaultRealmFeatures();
  features.oauthProvider = {
    enabled: true,
    dynamicClientRegistration: false
  };

  return {
    realm: {
      slug,
      name,
      description: "",
      iconUrl: "",
      appUrl,
      trustedOrigins: [appUrl],
      features
    },
    backendUrl
  };
};

const parseRequiredText = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
};

const parseOrigin = (value: unknown) => {
  if (typeof value !== "string" || value.length > 2_048) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !["", "/"].includes(url.pathname)
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
};
