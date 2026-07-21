import { beforeEach, describe, expect, test } from "bun:test";
import {
  OAuthResource,
  OAuthScope,
  oauthResourceIdentifier
} from "@nezdemkovski/auth-oauth-resource";
import { createReferenceProductApp } from "@nezdemkovski/auth-reference-product";

import { seedIntegrationRealm } from "./seed";
import {
  createIntegrationApp,
  createIntegrationUserResourceCredential,
  integrationPublicBaseUrl,
  installIntegrationAppFetch,
  readIntegrationJson,
  resetAndBootstrapIntegrationDatabase,
  signUpIntegrationUser
} from "./setup";

describe("reference product OAuth integration", () => {
  beforeEach(async () => {
    await resetAndBootstrapIntegrationDatabase();
  });

  test("accepts an application access token without creating a local auth system", async () => {
    const project = await seedIntegrationRealm({
      slug: "reference-auth",
      schema: "reference_auth",
      name: "Reference Auth",
      oauthProvider: { enabled: true }
    });
    const central = await createIntegrationApp();
    const restoreFetch = installIntegrationAppFetch(central.app);

    try {
      const user = await signUpIntegrationUser({
        app: central.app,
        projectSlug: project.slug,
        origin: project.appUrl,
        email: "user@example.com",
        password: "correct horse battery staple",
        name: "Demo User"
      });
      const credential = await createIntegrationUserResourceCredential({
        app: central.app,
        registry: central.registry,
        projectSlug: project.slug,
        userCookie: user.cookie,
        resource: oauthResourceIdentifier(
          integrationPublicBaseUrl,
          project.slug,
          OAuthResource.Application
        ),
        scopes: [OAuthScope.OpenId, OAuthScope.Profile, OAuthScope.Email]
      });
      const product = createReferenceProductApp({
        origin: project.appUrl,
        authIssuer: `${integrationPublicBaseUrl}/api/${project.slug}`,
        authClientId: credential.clientId
      });

      const accountResponse = await product.app.request("/api/me", {
        headers: {
          Authorization: `Bearer ${credential.accessToken}`,
          Origin: project.appUrl
        }
      });

      expect(accountResponse.status).toBe(200);
      expect(await readIntegrationJson(accountResponse)).toMatchObject({
        user: {
          id: user.userId,
          email: "user@example.com",
          name: "Demo User"
        },
        identity: {
          issuer: `${integrationPublicBaseUrl}/api/${project.slug}`,
          subject: user.userId
        }
      });

      const wrongClient = createReferenceProductApp({
        origin: project.appUrl,
        authIssuer: `${integrationPublicBaseUrl}/api/${project.slug}`,
        authClientId: "another-application-client"
      });
      const rejected = await wrongClient.app.request("/api/me", {
        headers: {
          Authorization: `Bearer ${credential.accessToken}`,
          Origin: project.appUrl
        }
      });

      expect(rejected.status).toBe(401);
      expect(await rejected.json()).toEqual({ error: "unauthorized" });
    } finally {
      restoreFetch();
      await central.close();
    }
  });
});
