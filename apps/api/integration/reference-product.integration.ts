import { beforeEach, describe, expect, test } from "bun:test";
import { createReferenceProductApp } from "@nezdemkovski/auth-reference-product";

import { DIRECT_CLIENT_IP_HEADER } from "../src/http/security";
import { isRecord } from "../src/runtime/type-guards";
import { seedIntegrationRealm } from "./seed";
import {
  createIntegrationApp,
  integrationPublicBaseUrl,
  resetAndBootstrapIntegrationDatabase,
  signUpIntegrationUser
} from "./setup";

const PRODUCT_ORIGIN = "http://127.0.0.1:3010";
const PRODUCT_CALLBACK = `${PRODUCT_ORIGIN}/api/auth/callback/auth-platform`;
const PRODUCT_SECRET = "reference-product-integration-secret-at-least-32-characters";

describe("reference product OAuth integration", () => {
  beforeEach(async () => {
    await resetAndBootstrapIntegrationDatabase();
  });

  test("establishes a local Better Auth session through central OAuth with PKCE", async () => {
    const project = await seedIntegrationRealm({
      slug: "reference-auth",
      schema: "reference_auth",
      name: "Reference Auth",
      oauthProvider: {
        enabled: true
      }
    });
    const central = await createIntegrationApp();
    const originalFetch = globalThis.fetch;
    const authFetch = Object.assign(
      (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1]
      ) => {
        const request = new Request(input, init);
        if (new URL(request.url).origin !== integrationPublicBaseUrl) {
          return originalFetch(input, init);
        }

        const headers = new Headers(request.headers);
        headers.set(DIRECT_CLIENT_IP_HEADER, "127.0.0.1");
        return central.app.fetch(new Request(request, { headers }));
      },
      {
        preconnect: originalFetch.preconnect
      }
    );
    globalThis.fetch = authFetch;

    try {
      const registered = central.registry.get(project.slug);
      if (!registered) {
        throw new Error("Expected the OAuth realm to be registered");
      }

      const centralUser = await signUpIntegrationUser({
        app: central.app,
        projectSlug: project.slug,
        origin: project.appUrl,
        email: "user@example.com",
        password: "correct horse battery staple",
        name: "Demo User"
      });
      const client = await registered.auth.api.adminCreateOAuthClient({
        headers: new Headers({
          Cookie: centralUser.cookie
        }),
        body: {
          client_name: "Reference Product",
          redirect_uris: [PRODUCT_CALLBACK],
          token_endpoint_auth_method: "client_secret_basic",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          scope: "openid profile email offline_access",
          type: "web",
          skip_consent: true,
          require_pkce: true
        }
      });
      if (!client.client_secret) {
        throw new Error("Expected a confidential OAuth client secret");
      }

      const issuer = `${integrationPublicBaseUrl}/api/${project.slug}`;
      const product = createReferenceProductApp({
        origin: PRODUCT_ORIGIN,
        secret: PRODUCT_SECRET,
        authIssuer: issuer,
        authClientId: client.client_id,
        authClientSecret: client.client_secret
      });

      const signIn = await product.app.request("/api/auth/sign-in/social", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: PRODUCT_ORIGIN
        },
        body: JSON.stringify({
          provider: "auth-platform",
          callbackURL: `${PRODUCT_ORIGIN}/signed-in`
        })
      });
      const signInBody = await readObject(signIn);
      const authorizationUrl = stringField(signInBody, "url");
      const authorizationRequest = new URL(authorizationUrl);

      expect(signIn.status).toBe(200);
      expect(authorizationRequest.pathname).toBe(
        `/api/${project.slug}/auth/oauth2/authorize`
      );
      expect(authorizationRequest.searchParams.get("code_challenge")).not.toBeNull();
      expect(authorizationRequest.searchParams.get("code_challenge_method")).toBe(
        "S256"
      );
      expect(authorizationRequest.searchParams.get("redirect_uri")).toBe(
        PRODUCT_CALLBACK
      );

      const productStateCookie = responseCookieHeader(signIn);
      expect(productStateCookie).toContain("reference_product.state=");

      const authorization = await central.app.request(authorizationUrl, {
        headers: {
          Cookie: centralUser.cookie,
          [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
        }
      });
      const callbackUrl = requiredHeader(authorization, "location");

      expect(authorization.status).toBe(302);
      expect(new URL(callbackUrl).origin).toBe(PRODUCT_ORIGIN);
      expect(new URL(callbackUrl).searchParams.get("iss")).toBe(issuer);

      const callback = await product.app.request(callbackUrl, {
        headers: {
          Cookie: productStateCookie,
          Origin: PRODUCT_ORIGIN
        }
      });
      const productSessionCookie = responseCookieHeader(callback);

      expect(callback.status).toBe(302);
      expect(requiredHeader(callback, "location")).toBe(`${PRODUCT_ORIGIN}/signed-in`);
      expect(productSessionCookie).toContain("reference_product.session_token=");
      expect(productSessionCookie).not.toContain("auth_reference-auth.session_token=");
      expect(callback.headers.getSetCookie().join("; ")).toContain("HttpOnly");

      const sessionHeaders = new Headers({
        Cookie: productSessionCookie,
        Origin: PRODUCT_ORIGIN
      });
      const accountResponse = await product.app.request("/api/me", {
        headers: sessionHeaders
      });
      const account = await readObject(accountResponse);

      expect(accountResponse.status).toBe(200);
      expect(account).toMatchObject({
        user: {
          email: "user@example.com",
          name: "Demo User"
        },
        identity: {
          issuer,
          subject: centralUser.userId
        }
      });
      expect(JSON.stringify(account)).not.toContain("accessToken");
      expect(JSON.stringify(account)).not.toContain("refreshToken");

      const accounts = await product.auth.api.listUserAccounts({
        headers: sessionHeaders
      });
      expect(accounts).toContainEqual(
        expect.objectContaining({
          providerId: "auth-platform",
          accountId: centralUser.userId
        })
      );

      const access = await product.auth.api.getAccessToken({
        headers: sessionHeaders,
        body: {
          providerId: "auth-platform"
        }
      });
      expect(access.accessToken.length).toBeGreaterThan(0);
      expect(access.scopes).toEqual(
        expect.arrayContaining(["openid", "profile", "email", "offline_access"])
      );

      const firstRefresh = await product.auth.api.refreshToken({
        headers: sessionHeaders,
        body: {
          providerId: "auth-platform"
        }
      });
      const secondRefresh = await product.auth.api.refreshToken({
        headers: sessionHeaders,
        body: {
          providerId: "auth-platform"
        }
      });

      expect(firstRefresh.refreshToken).not.toBe(secondRefresh.refreshToken);
      expect(secondRefresh.accessToken).not.toBe(firstRefresh.accessToken);

      const mismatchProduct = createReferenceProductApp({
        origin: PRODUCT_ORIGIN,
        secret: PRODUCT_SECRET,
        authIssuer: issuer,
        authClientId: client.client_id,
        authClientSecret: client.client_secret
      });
      const mismatchSignIn = await mismatchProduct.app.request(
        "/api/auth/sign-in/social",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: PRODUCT_ORIGIN
          },
          body: JSON.stringify({
            provider: "auth-platform",
            callbackURL: `${PRODUCT_ORIGIN}/signed-in`
          })
        }
      );
      const mismatchSignInBody = await readObject(mismatchSignIn);
      const mismatchAuthorization = await central.app.request(
        stringField(mismatchSignInBody, "url"),
        {
          headers: {
            Cookie: centralUser.cookie,
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          }
        }
      );
      const mismatchedCallbackUrl = new URL(
        requiredHeader(mismatchAuthorization, "location")
      );
      mismatchedCallbackUrl.searchParams.set("iss", "https://wrong-issuer.example.com");

      const mismatchedCallback = await mismatchProduct.app.request(
        mismatchedCallbackUrl,
        {
          headers: {
            Cookie: responseCookieHeader(mismatchSignIn),
            Origin: PRODUCT_ORIGIN
          }
        }
      );

      expect(mismatchedCallback.status).toBe(302);
      expect(requiredHeader(mismatchedCallback, "location")).toContain(
        "error=issuer_mismatch"
      );
    } finally {
      globalThis.fetch = originalFetch;
      await central.close();
    }
  }, 30_000);
});

const responseCookieHeader = (response: Response) => {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .filter(Boolean)
    .join("; ");
};

const requiredHeader = (response: Response, name: string) => {
  const value = response.headers.get(name);
  if (!value) {
    throw new Error(`Expected response header ${name}`);
  }

  return value;
};

const readObject = async (response: Response) => {
  const body: unknown = await response.json();
  if (!isRecord(body)) {
    throw new Error("Expected a JSON object response");
  }

  return body;
};

const stringField = (value: Record<string, unknown>, field: string) => {
  const fieldValue = value[field];
  if (typeof fieldValue !== "string" || !fieldValue) {
    throw new Error(`Expected ${field} to be a non-empty string`);
  }

  return fieldValue;
};
