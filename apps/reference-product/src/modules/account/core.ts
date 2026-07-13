import {
  readAuthPlatformIdentity,
  type AuthPlatformIdentity
} from "@nezdemkovski/auth-integration";

import type { ReferenceProductAuth } from "../../auth/product-auth";

export type ProductAccount = {
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
  };
  identity: AuthPlatformIdentity;
};

export class CentralIdentityMissingError extends Error {
  constructor() {
    super("The local session has no linked central auth account");
    this.name = "CentralIdentityMissingError";
  }
}

export const readProductAccount = async (options: {
  auth: ReferenceProductAuth;
  headers: Headers;
  authIssuer: string;
}): Promise<ProductAccount | null> => {
  const session = await options.auth.api.getSession({
    headers: options.headers
  });
  if (!session) {
    return null;
  }

  const accounts = await options.auth.api.listUserAccounts({
    headers: options.headers
  });
  const identity = readAuthPlatformIdentity(accounts, {
    issuer: options.authIssuer
  });
  if (!identity) {
    throw new CentralIdentityMissingError();
  }

  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image
    },
    identity
  };
};
