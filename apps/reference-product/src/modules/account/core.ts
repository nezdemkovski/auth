import {
  extractBearerToken,
  type AuthIdentity,
  type AuthServer
} from "@nezdemkovski/auth/server";

export type ProductAccount = {
  user: {
    id: string;
    name?: string;
    email?: string;
    image?: string;
  };
  identity: AuthIdentity;
};

export const readProductAccount = async (options: {
  auth: AuthServer;
  request: Request;
}): Promise<ProductAccount | null> => {
  if (!extractBearerToken(options.request.headers.get("authorization"))) {
    return null;
  }
  const identity = await options.auth.verifyRequest(options.request);

  return {
    user: {
      id: identity.subject,
      ...(identity.name ? { name: identity.name } : {}),
      ...(identity.email ? { email: identity.email } : {}),
      ...(identity.image ? { image: identity.image } : {})
    },
    identity
  };
};
