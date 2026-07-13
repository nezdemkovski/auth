import { beforeEach, describe, expect, test } from "bun:test";

import {
  createIntegrationApp,
  readIntegrationJson,
  resetAndBootstrapIntegrationDatabase,
  signInIntegrationUser,
  signUpIntegrationUser
} from "./setup";
import { seedIntegrationRealm } from "./seed";
import { DIRECT_CLIENT_IP_HEADER } from "../src/http/security";

describe("auth integration", () => {
  beforeEach(async () => {
    await resetAndBootstrapIntegrationDatabase();
  });

  test("signs up, signs in, and reads the session in one realm", async () => {
    const project = await seedIntegrationRealm({
      slug: "integration-auth",
      schema: "integration_auth_auth",
      name: "Integration Auth"
    });
    const { app, close } = await createIntegrationApp();

    try {
      const password = "correct horse battery staple";
      const created = await signUpIntegrationUser({
        app,
        projectSlug: project.slug,
        origin: project.appUrl,
        email: "auth-user@integration.test",
        password,
        name: "Auth User"
      });

      const signedIn = await signInIntegrationUser({
        app,
        projectSlug: project.slug,
        origin: project.appUrl,
        email: "auth-user@integration.test",
        password
      });
      const session = await app.request(
        `/api/${project.slug}/auth/get-session`,
        {
          headers: {
            Cookie: signedIn.cookie,
            Origin: project.appUrl,
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          }
        }
      );

      expect(session.status).toBe(200);
      expect(await readIntegrationJson(session)).toMatchObject({
        user: {
          id: created.userId,
          email: "auth-user@integration.test",
          name: "Auth User"
        }
      });
      expect(session.headers.get("set-auth-jwt")).toBeNull();

      const legacyToken = await app.request(
        `/api/${project.slug}/auth/token`,
        {
          headers: {
            Cookie: signedIn.cookie,
            Origin: project.appUrl,
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          }
        }
      );
      expect(legacyToken.status).toBe(404);
    } finally {
      await close();
    }
  });

  test("keeps sessions, origins, and realms isolated", async () => {
    const first = await seedIntegrationRealm({
      slug: "first-auth",
      schema: "first_auth_auth",
      name: "First Auth"
    });
    const second = await seedIntegrationRealm({
      slug: "second-auth",
      schema: "second_auth_auth",
      name: "Second Auth"
    });
    const { app, close } = await createIntegrationApp();

    try {
      const { cookie } = await signUpIntegrationUser({
        app,
        projectSlug: first.slug,
        origin: first.appUrl,
        email: "first-auth-user@integration.test",
        password: "correct horse battery staple"
      });

      const crossRealm = await app.request(
        `/api/${second.slug}/auth/get-session`,
        {
          headers: {
            Cookie: cookie,
            Origin: second.appUrl,
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          }
        }
      );
      expect(crossRealm.status).toBe(200);
      expect(await crossRealm.json()).toBeNull();

      const untrustedOrigin = await app.request(
        `/api/${first.slug}/auth/sign-up/email`,
        {
          method: "OPTIONS",
          headers: {
            Origin: "https://evil.integration.test",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          }
        }
      );
      expect(untrustedOrigin.headers.get("access-control-allow-origin")).toBeNull();

      const unknownRealm = await app.request("/api/nope/auth/get-session", {
        headers: {
          [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
        }
      });
      expect(unknownRealm.status).toBe(404);
      expect(await readIntegrationJson(unknownRealm)).toMatchObject({
        error: "unknown_project"
      });
    } finally {
      await close();
    }
  });

  test("serves the same JWKS from public and canonical realm paths", async () => {
    const project = await seedIntegrationRealm({
      slug: "jwks-auth",
      schema: "jwks_auth",
      name: "JWKS Auth"
    });
    const { app, close } = await createIntegrationApp();

    try {
      const publicResponse = await app.request(
        `/api/${project.slug}/.well-known/jwks.json`,
        {
          headers: {
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          }
        }
      );
      const canonicalResponse = await app.request(
        `/api/${project.slug}/auth/.well-known/jwks.json`,
        {
          headers: {
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          }
        }
      );

      expect(publicResponse.status).toBe(200);
      expect(canonicalResponse.status).toBe(200);

      const publicJwks = await readIntegrationJson(publicResponse);
      const canonicalJwks = await readIntegrationJson(canonicalResponse);
      expect(publicJwks).toEqual(canonicalJwks);
      expect(Array.isArray(publicJwks.keys)).toBe(true);
      expect(publicJwks.keys).not.toHaveLength(0);
    } finally {
      await close();
    }
  });

  test("blocks disabled feature routes before Better Auth handles them", async () => {
    const project = await seedIntegrationRealm({
      slug: "feature-gated-auth",
      schema: "feature_gated_auth",
      name: "Feature Gated Auth"
    });
    const { app, close } = await createIntegrationApp();

    try {
      const passkey = await app.request(
        `/api/${project.slug}/auth/passkey/generate-authenticate-options`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: project.appUrl,
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          },
          body: "{}"
        }
      );
      expect(passkey.status).toBe(404);

      const oauthMetadata = await app.request(
        `/api/${project.slug}/.well-known/oauth-authorization-server`,
        {
          headers: {
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          }
        }
      );
      expect(oauthMetadata.status).toBe(404);
    } finally {
      await close();
    }
  });
});
