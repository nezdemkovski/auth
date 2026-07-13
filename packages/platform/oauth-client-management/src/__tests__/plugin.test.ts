import { describe, expect, test } from "bun:test";
import {
  oauthProvider,
  type OAuthOptions,
  type Scope
} from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";

import {
  OAuthClientProfile,
  oauthClientManagement
} from "../index";

const baseUrl = "https://auth.example.com";
const billingResource = `${baseUrl}/api/demo/billing`;
const oauthOptions: OAuthOptions<Scope[]> = {
  loginPage: "/login",
  consentPage: "/consent",
  scopes: ["openid", "billing:usage:write"],
  resources: [
    {
      identifier: billingResource,
      allowedScopes: ["billing:usage:write"]
    }
  ],
  enforcePerClientResources: true
};

const createAuth = () =>
  betterAuth({
    baseURL: `${baseUrl}/api/demo/auth`,
    secret: "test-secret-test-secret-test-secret-test-secret",
    plugins: [
      oauthProvider(oauthOptions),
      oauthClientManagement(oauthOptions),
      jwt({
        disableSettingJwtHeader: true,
        jwt: {
          issuer: `${baseUrl}/api/demo`,
          audience: "demo"
        }
      })
    ]
  });

describe("OAuth client management plugin", () => {
  test("manages an ownerless service client without exposing its stored secret", async () => {
    const auth = createAuth();
    await auth.$context;

    const created = await auth.api.createOAuthClientForManagement({
      body: {
        name: "Demo Worker",
        profile: OAuthClientProfile.Service,
        redirectUris: [],
        postLogoutRedirectUris: [],
        scopes: ["billing:usage:write"],
        resources: [billingResource]
      }
    });
    expect(created.credential.clientSecret).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(created.client).toMatchObject({
      clientId: created.credential.clientId,
      name: "Demo Worker",
      profile: OAuthClientProfile.Service,
      resources: [billingResource],
      secretConfigured: true,
      disabled: false
    });

    const listed = await auth.api.listOAuthClientsForManagement();
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty("clientSecret");
    expect(listed[0]).toMatchObject({
      clientId: created.credential.clientId,
      secretConfigured: true
    });

    const updated = await auth.api.updateOAuthClientForManagement({
      body: {
        clientId: created.credential.clientId,
        update: {
          name: "Updated Demo Worker",
          resources: [billingResource],
          skipConsent: false
        }
      }
    });
    expect(updated).toMatchObject({
      name: "Updated Demo Worker",
      profile: OAuthClientProfile.Service,
      resources: [billingResource],
      skipConsent: true
    });
    expect(
      await auth.api.getOAuthClientForManagement({
        query: { clientId: created.credential.clientId }
      })
    ).toMatchObject({
      name: "Updated Demo Worker",
      secretConfigured: true
    });

    const rotated = await auth.api.rotateOAuthClientSecretForManagement({
      body: { clientId: created.credential.clientId }
    });
    expect(rotated.clientSecret).not.toBe(created.credential.clientSecret);

    const disabled = await auth.api.setOAuthClientDisabledForManagement({
      body: {
        clientId: created.credential.clientId,
        disabled: true
      }
    });
    expect(disabled.disabled).toBe(true);

    const enabled = await auth.api.setOAuthClientDisabledForManagement({
      body: {
        clientId: created.credential.clientId,
        disabled: false
      }
    });
    expect(enabled.disabled).toBe(false);

    await auth.api.deleteOAuthClientForManagement({
      body: { clientId: created.credential.clientId }
    });
    expect(await auth.api.listOAuthClientsForManagement()).toEqual([]);
    await expect(
      auth.api.getOAuthClientForManagement({
        query: { clientId: created.credential.clientId }
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test("rejects invalid profile shapes at the Better Auth boundary", async () => {
    const auth = createAuth();
    await auth.$context;

    await expect(
      auth.api.createOAuthClientForManagement({
        body: {
          name: "Demo Worker",
          profile: OAuthClientProfile.Service,
          redirectUris: ["https://demo.example.com/callback"],
          postLogoutRedirectUris: [],
          scopes: ["billing:usage:write"],
          resources: []
        }
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
