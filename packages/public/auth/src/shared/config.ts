export const DEFAULT_AUTH_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "storage:avatar:write",
  "storage:avatar:delete",
  "billing:usage:read",
  "billing:checkout:create",
  "billing:portal:read"
];

export type AuthConfiguration = {
  issuer: string;
  clientId: string;
};

export type NormalizedAuthConfiguration = AuthConfiguration & {
  applicationResource: string;
  jwksUrl: string;
  tokenKindClaim: string;
};

export const normalizeAuthConfiguration = (
  configuration: AuthConfiguration
): NormalizedAuthConfiguration => {
  const issuer = configuration.issuer.trim().replace(/\/+$/, "");
  const clientId = configuration.clientId.trim();
  const issuerUrl = new URL(issuer);

  if (!clientId) {
    throw new Error("AUTH_CLIENT_ID is required");
  }

  return {
    issuer,
    clientId,
    applicationResource: `${issuer}/app`,
    jwksUrl: `${issuer}/auth/.well-known/jwks.json`,
    tokenKindClaim: `${issuerUrl.origin}/claims/token-kind`
  };
};

export const openIdConfigurationUrl = (issuer: string) =>
  `${issuer}/.well-known/openid-configuration`;

export const realmSlugFromIssuer = (issuer: string) => {
  const segments = new URL(issuer).pathname.split("/").filter(Boolean);
  const realmSlug = segments.at(-1);
  if (!realmSlug || !/^[a-z][a-z0-9+.-]*$/i.test(realmSlug)) {
    throw new Error("The issuer does not contain a valid realm slug");
  }
  return realmSlug;
};
