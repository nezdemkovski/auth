import { beforeEach, describe, expect, test } from "bun:test";

import { pkceChallenge } from "../src/modules/login/core";
import {
  createIntegrationApp,
  readIntegrationJson,
  resetAndBootstrapIntegrationDatabase,
  signUpIntegrationUser
} from "./setup";
import { seedIntegrationRealm } from "./seed";
import { DIRECT_CLIENT_IP_HEADER } from "../src/http/security";

describe("hosted login integration", () => {
  beforeEach(async () => {
    await resetAndBootstrapIntegrationDatabase();
  });

  test("issues and exchanges a one-time PKCE login code for the signed-in user", async () => {
    const project = await seedIntegrationRealm({
      slug: "integration-login",
      schema: "integration_login_auth",
      name: "Integration Login"
    });
    const { app, close } = await createIntegrationApp();
    const redirectUri = `${project.appUrl}/auth/callback`;
    const codeVerifier = "integration-login-code-verifier-with-enough-entropy";
    const codeChallenge = pkceChallenge(codeVerifier);

    try {
      const { cookie } = await signUpIntegrationUser({
        app,
        projectSlug: project.slug,
        origin: project.appUrl,
        email: "login-user@integration.test",
        password: "correct horse battery staple"
      });

      const config = await app.request(
        `/api/${project.slug}/login/config/login?${new URLSearchParams({
          redirect_uri: redirectUri,
          state: "state-123",
          code_challenge: codeChallenge,
          code_challenge_method: "S256"
        })}`,
        {
          headers: {
            Origin: project.appUrl,
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          }
        }
      );
      expect(config.status).toBe(200);
      expect(await readIntegrationJson(config)).toMatchObject({
        project: project.slug,
        projectName: project.name,
        redirectUri,
        state: "state-123",
        codeChallenge
      });

      const sessionCode = await app.request(
        `/api/${project.slug}/login/session-code`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookie,
            Origin: project.appUrl,
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          },
          body: JSON.stringify({
            redirect_uri: redirectUri,
            state: "state-123",
            code_challenge: codeChallenge
          })
        }
      );
      expect(sessionCode.status).toBe(200);
      const issued = await readIntegrationJson(sessionCode);
      expect(issued).toMatchObject({
        email: "login-user@integration.test"
      });
      const code = new URL(String(issued.redirectTo)).searchParams.get("code") ?? "";
      expect(code.length).toBeGreaterThan(0);
      expect(new URL(String(issued.redirectTo)).searchParams.get("state")).toBe("state-123");

      const exchanged = await exchangeCode({
        app,
        projectSlug: project.slug,
        origin: project.appUrl,
        code,
        redirectUri,
        codeVerifier
      });
      expect(exchanged.status).toBe(200);
      expect(await readIntegrationJson(exchanged)).toMatchObject({
        email: "login-user@integration.test",
        sessionCookie: expect.stringContaining("=")
      });

      const replay = await exchangeCode({
        app,
        projectSlug: project.slug,
        origin: project.appUrl,
        code,
        redirectUri,
        codeVerifier
      });
      expect(replay.status).toBe(400);
      expect(await readIntegrationJson(replay)).toMatchObject({
        error: "invalid_code"
      });
    } finally {
      await close();
    }
  });

  test("rejects untrusted redirects, missing sessions, and wrong PKCE verifiers", async () => {
    const project = await seedIntegrationRealm({
      slug: "rejected-login",
      schema: "rejected_login_auth",
      name: "Rejected Login"
    });
    const { app, close } = await createIntegrationApp();
    const redirectUri = `${project.appUrl}/auth/callback`;
    const codeVerifier = "rejected-login-code-verifier-with-enough-entropy";
    const codeChallenge = pkceChallenge(codeVerifier);

    try {
      const invalidConfig = await app.request(
        `/api/${project.slug}/login/config/login?${new URLSearchParams({
          redirect_uri: "https://evil.integration.test/callback",
          state: "state-123",
          code_challenge: codeChallenge,
          code_challenge_method: "S256"
        })}`,
        {
          headers: {
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          }
        }
      );
      expect(invalidConfig.status).toBe(400);
      expect(await readIntegrationJson(invalidConfig)).toMatchObject({
        error: "invalid_redirect_uri"
      });

      const missingSession = await app.request(
        `/api/${project.slug}/login/session-code`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: project.appUrl,
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          },
          body: JSON.stringify({
            redirect_uri: redirectUri,
            state: "state-123",
            code_challenge: codeChallenge
          })
        }
      );
      expect(missingSession.status).toBe(401);
      expect(await readIntegrationJson(missingSession)).toMatchObject({
        error: "unauthorized"
      });

      const { cookie } = await signUpIntegrationUser({
        app,
        projectSlug: project.slug,
        origin: project.appUrl,
        email: "wrong-pkce@integration.test",
        password: "correct horse battery staple"
      });
      const sessionCode = await app.request(
        `/api/${project.slug}/login/session-code`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookie,
            Origin: project.appUrl,
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          },
          body: JSON.stringify({
            redirect_uri: redirectUri,
            state: "state-123",
            code_challenge: codeChallenge
          })
        }
      );
      const issued = await readIntegrationJson(sessionCode);
      const code = new URL(String(issued.redirectTo)).searchParams.get("code") ?? "";
      const wrongVerifier = await exchangeCode({
        app,
        projectSlug: project.slug,
        origin: project.appUrl,
        code,
        redirectUri,
        codeVerifier: "wrong-login-code-verifier-with-enough-entropy"
      });
      expect(wrongVerifier.status).toBe(400);
      expect(await readIntegrationJson(wrongVerifier)).toMatchObject({
        error: "invalid_code"
      });
    } finally {
      await close();
    }
  });
});

const exchangeCode = (input: {
  app: Awaited<ReturnType<typeof createIntegrationApp>>["app"];
  projectSlug: string;
  origin: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}) => {
  return input.app.request(`/api/${input.projectSlug}/login/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: input.origin,
      [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
    },
    body: JSON.stringify({
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier
    })
  });
};
