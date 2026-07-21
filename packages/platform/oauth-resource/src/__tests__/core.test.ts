import { describe, expect, test } from "bun:test";
import type { ResourceServerMetadata } from "@better-auth/oauth-provider";

import {
  OAuthResource,
  OAuthResourceFailureCode,
  OAuthScope,
  OAuthTokenKind,
  createOAuthResourceAuthorizer,
  oauthTokenKindClaim,
  readOAuthResourceMetadata
} from "../index";

const publicBaseUrl = "https://auth.example.com";

const createRegistered = (claims: Record<string, unknown>) => {
  const verificationOptions: {
    jwksUrl: string;
    issuer: string;
    audience: string;
    scopes: string[];
  }[] = [];
  const registered = {
    marker: "registered-context"
  };
  const registration = {
    registered,
    projectSlug: "demo",
    oauthProviderEnabled: true,
    auth: {
      getProtectedResourceMetadata: async (metadata: ResourceServerMetadata) =>
        metadata,
      verifyAccessTokenRequest: async (
        _request: unknown,
        options: {
          jwksUrl: string;
          issuer: string;
          audience: string;
          scopes: string[];
        }
      ) => {
        verificationOptions.push(options);
        return claims;
      }
    }
  };
  const registry = {
    get: (projectSlug: string) =>
      projectSlug === registration.projectSlug ? registration : null
  };

  return { registered, registry, verificationOptions };
};

describe("OAuth resource authorization", () => {
  test("accepts user tokens only with a distinct subject and canonical client claims", async () => {
    const tokenKindClaim = oauthTokenKindClaim(publicBaseUrl);
    const { registered, registry, verificationOptions } = createRegistered({
      sub: "user-id",
      azp: "client-id",
      client_id: "client-id",
      [tokenKindClaim]: OAuthTokenKind.User
    });
    const authorizer = createOAuthResourceAuthorizer({
      registry,
      publicBaseUrl
    });

    await expect(
      authorizer.authorizeUser({
        projectSlug: "demo",
        request: new Request("https://auth.example.com/api/demo/upload", {
          headers: { Authorization: "Bearer token" }
        }),
        resource: OAuthResource.Storage,
        scopes: [OAuthScope.StorageAvatarWrite]
      })
    ).resolves.toEqual({
      ok: true,
      value: {
        registered,
        subject: "user-id",
        clientId: "client-id"
      }
    });
    expect(verificationOptions).toEqual([
      {
        jwksUrl: "https://auth.example.com/api/demo/.well-known/jwks.json",
        issuer: "https://auth.example.com/api/demo",
        audience: "https://auth.example.com/api/demo/upload",
        scopes: [OAuthScope.StorageAvatarWrite]
      }
    ]);
  });

  test("rejects a user token presented to the service-only boundary", async () => {
    const tokenKindClaim = oauthTokenKindClaim(publicBaseUrl);
    const { registry } = createRegistered({
      sub: "user-id",
      azp: "client-id",
      client_id: "client-id",
      [tokenKindClaim]: OAuthTokenKind.User
    });
    const authorizer = createOAuthResourceAuthorizer({
      registry,
      publicBaseUrl
    });

    await expect(
      authorizer.authorizeService({
        projectSlug: "demo",
        request: new Request("https://auth.example.com/api/demo/billing", {
          headers: { Authorization: "Bearer token" }
        }),
        resource: OAuthResource.Billing,
        scopes: [OAuthScope.BillingUsageWrite]
      })
    ).resolves.toMatchObject({
      ok: false,
      failure: {
        error: OAuthResourceFailureCode.Unauthorized,
        status: 401
      }
    });
  });

  test("translates the official verifier scope failure into an OAuth challenge", async () => {
    const registry = {
      get: () => ({
        registered: { marker: "registered-context" },
        projectSlug: "demo",
        oauthProviderEnabled: true,
        auth: {
          getProtectedResourceMetadata: async (
            metadata: ResourceServerMetadata
          ) => metadata,
          verifyAccessTokenRequest: async () => {
            throw { statusCode: 403 };
          }
        }
      })
    };
    const authorizer = createOAuthResourceAuthorizer({
      registry,
      publicBaseUrl
    });

    await expect(
      authorizer.authorizeUser({
        projectSlug: "demo",
        request: new Request("https://auth.example.com/api/demo/upload", {
          headers: { Authorization: "Bearer token" }
        }),
        resource: OAuthResource.Storage,
        scopes: [OAuthScope.StorageAvatarWrite]
      })
    ).resolves.toMatchObject({
      ok: false,
      failure: {
        error: OAuthResourceFailureCode.InsufficientScope,
        status: 403
      }
    });
  });

  test("uses the official resource metadata port and hides disabled realms", async () => {
    const { registry } = createRegistered({});
    await expect(
      readOAuthResourceMetadata({
        registry,
        publicBaseUrl,
        projectSlug: "demo",
        resource: OAuthResource.Storage
      })
    ).resolves.toEqual({
      resource: "https://auth.example.com/api/demo/upload",
      scopes_supported: [
        OAuthScope.StorageAvatarWrite,
        OAuthScope.StorageAvatarDelete
      ]
    });

    await expect(
      readOAuthResourceMetadata({
        registry,
        publicBaseUrl,
        projectSlug: "missing",
        resource: OAuthResource.Storage
      })
    ).rejects.toMatchObject({ kind: "unknown_project" });
  });

  test("keeps authorization-server identity scopes out of app resource metadata", async () => {
    const { registry } = createRegistered({});

    await expect(
      readOAuthResourceMetadata({
        registry,
        publicBaseUrl,
        projectSlug: "demo",
        resource: OAuthResource.Application
      })
    ).resolves.toEqual({
      resource: "https://auth.example.com/api/demo/app",
      scopes_supported: [
        OAuthScope.StorageAvatarWrite,
        OAuthScope.StorageAvatarDelete,
        OAuthScope.BillingUsageRead,
        OAuthScope.BillingCheckoutCreate,
        OAuthScope.BillingPortalRead
      ]
    });
  });
});
