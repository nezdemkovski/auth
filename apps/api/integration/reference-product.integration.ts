import { beforeEach, describe, expect, test } from "bun:test";
import { createReferenceProductApp } from "@nezdemkovski/auth-reference-product";

import { ProjectTwoFactorRequirement } from "../src/config/projects";
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
      },
      twoFactor: {
        enabled: true,
        required: ProjectTwoFactorRequirement.Everyone
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

      const clientOwner = await signUpIntegrationUser({
        app: central.app,
        projectSlug: project.slug,
        origin: project.appUrl,
        email: "owner@example.com",
        password: "correct horse battery staple",
        name: "Client Owner"
      });
      const client = await registered.auth.api.adminCreateOAuthClient({
        headers: new Headers({
          Cookie: clientOwner.cookie
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
          [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
        }
      });
      const hostedLoginUrl = new URL(
        requiredHeader(authorization, "location"),
        integrationPublicBaseUrl
      );

      expect(authorization.status).toBe(302);
      expect(hostedLoginUrl.pathname).toBe(`/login/${project.slug}`);
      expect(hostedLoginUrl.searchParams.get("sig")).not.toBeNull();
      expect(hostedLoginUrl.searchParams.get("ba_param")).not.toBeNull();

      const loginConfig = await central.app.request(
        `/api/${project.slug}/login/config/login${hostedLoginUrl.search}`,
        {
          headers: {
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          }
        }
      );
      expect(loginConfig.status).toBe(200);
      expect(await readObject(loginConfig)).toMatchObject({
        oauthProviderFlow: true,
        redirectUri: PRODUCT_CALLBACK
      });

      const hostedSignup = await central.app.request(
        `/api/${project.slug}/auth/sign-up/email`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Origin: integrationPublicBaseUrl,
            "Sec-Fetch-Mode": "cors",
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          },
          body: JSON.stringify({
            name: "Demo User",
            email: "user@example.com",
            password: "correct horse battery staple",
            oauth_query: hostedLoginUrl.searchParams.toString()
          })
        }
      );
      const hostedSignupBody = await readObject(hostedSignup);
      if (hostedSignup.status !== 200) {
        throw new Error(
          `Expected hosted signup to continue OAuth, got ${hostedSignup.status}: ${JSON.stringify(hostedSignupBody)}`
        );
      }
      const postLoginUrl = new URL(
        stringField(hostedSignupBody, "url"),
        integrationPublicBaseUrl
      );
      let centralUserCookie = responseCookieHeader(hostedSignup);

      expect(hostedSignup.status).toBe(200);
      expect(centralUserCookie).toContain(
        "auth_reference-auth.session_token="
      );
      expect(postLoginUrl.pathname).toBe(`/login/${project.slug}`);
      expect(postLoginUrl.searchParams.get("sig")).not.toBeNull();

      const nextAction = await central.app.request(
        `/api/${project.slug}/login/next-action`,
        {
          headers: {
            Cookie: centralUserCookie,
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          }
        }
      );
      expect(nextAction.status).toBe(200);
      expect(await readObject(nextAction)).toMatchObject({
        action: "enroll_2fa"
      });

      const enrollment = await registered.auth.api.enableTwoFactor({
        headers: new Headers({
          Cookie: centralUserCookie
        }),
        body: {
          password: "correct horse battery staple",
          method: "totp",
          issuer: project.name
        }
      });
      if (enrollment.method !== "totp" || !enrollment.totpURI) {
        throw new Error("Expected TOTP enrollment details");
      }

      const totpSecret = new URL(enrollment.totpURI).searchParams.get("secret");
      if (!totpSecret) {
        throw new Error("Expected the TOTP URI to contain a secret");
      }
      const generatedTotp = await registered.auth.api.generateTOTP({
        body: {
          secret: decodeTotpSecret(totpSecret)
        }
      });

      const verifiedEnrollment = await central.app.request(
        `/api/${project.slug}/auth/two-factor/verify-totp`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Cookie: centralUserCookie,
            Origin: integrationPublicBaseUrl,
            "Sec-Fetch-Mode": "cors",
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          },
          body: JSON.stringify({
            code: generatedTotp.code,
            trustDevice: true,
            oauth_query: postLoginUrl.searchParams.toString()
          })
        }
      );
      const verifiedEnrollmentBody = await readObject(verifiedEnrollment);
      centralUserCookie = responseCookieHeader(verifiedEnrollment);

      if (verifiedEnrollment.status !== 200) {
        throw new Error(
          `Expected TOTP verification to succeed, got ${verifiedEnrollment.status}: ${JSON.stringify(verifiedEnrollmentBody)}`
        );
      }
      expect(verifiedEnrollment.status).toBe(200);
      expect(centralUserCookie).toContain(
        "auth_reference-auth.session_token="
      );
      const callbackUrl = stringField(verifiedEnrollmentBody, "url");
      const callbackRequestUrl = new URL(callbackUrl);

      expect(callbackRequestUrl.origin).toBe(PRODUCT_ORIGIN);
      expect(callbackRequestUrl.searchParams.get("iss")).toBe(issuer);

      const centralSessionResponse = await central.app.request(
        `/api/${project.slug}/auth/get-session`,
        {
          headers: {
            Cookie: centralUserCookie,
            Origin: integrationPublicBaseUrl,
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          }
        }
      );
      const centralSession = await readObject(centralSessionResponse);
      const centralUserId = stringField(objectField(centralSession, "user"), "id");

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
          subject: centralUserId
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
          accountId: centralUserId
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
            Cookie: centralUserCookie,
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

const objectField = (value: Record<string, unknown>, field: string) => {
  const fieldValue = value[field];
  if (!isRecord(fieldValue)) {
    throw new Error(`Expected ${field} to be an object`);
  }

  return fieldValue;
};

const decodeTotpSecret = (encoded: string) => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const character of encoded.toUpperCase()) {
    if (character === "=") {
      break;
    }

    const value = alphabet.indexOf(character);
    if (value < 0) {
      throw new Error("Expected a valid Base32 TOTP secret");
    }

    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }

  return new TextDecoder().decode(Uint8Array.from(bytes));
};
