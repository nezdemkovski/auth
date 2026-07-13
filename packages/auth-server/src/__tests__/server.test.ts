import { describe, expect, test } from "bun:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createRealmAuth, extractBearerToken } from "../index";

const createTokenFixture = async (realm = "demo") => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "test-key";
  const keyResolver = createLocalJWKSet({ keys: [publicJwk] });
  const token = await new SignJWT({
    project: realm,
    name: "Demo User",
    email: "user@example.com",
    email_verified: true,
    telegram_id: "123"
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setSubject("user-1")
    .setIssuer(`https://auth.example.com/api/${realm}`)
    .setAudience(realm)
    .setExpirationTime("5m")
    .sign(privateKey);
  return { keyResolver, token };
};

describe("realm auth server", () => {
  test("extracts strict bearer tokens", () => {
    expect(extractBearerToken("Bearer token-value")).toBe("token-value");
    expect(extractBearerToken("bearer token-value")).toBe("token-value");
    expect(extractBearerToken("Basic token-value")).toBeNull();
    expect(extractBearerToken("Bearer")).toBeNull();
  });

  test("verifies issuer, audience, realm, and public identity claims", async () => {
    const fixture = await createTokenFixture();
    const auth = createRealmAuth({
      baseUrl: "https://auth.example.com",
      realm: "demo",
      keyResolver: fixture.keyResolver
    });
    await expect(auth.verifyToken(fixture.token)).resolves.toEqual({
      id: "user-1",
      realm: "demo",
      name: "Demo User",
      image: null,
      email: "user@example.com",
      emailVerified: true,
      telegramId: "123"
    });
  });

  test("rejects a token issued for another realm", async () => {
    const fixture = await createTokenFixture("other");
    const auth = createRealmAuth({
      baseUrl: "https://auth.example.com",
      realm: "demo",
      keyResolver: fixture.keyResolver
    });
    await expect(auth.verifyToken(fixture.token)).rejects.toMatchObject({ code: "invalid_token" });
  });

  test("requires an authorization header at the request boundary", async () => {
    const fixture = await createTokenFixture();
    const auth = createRealmAuth({
      baseUrl: "https://auth.example.com",
      realm: "demo",
      keyResolver: fixture.keyResolver
    });
    await expect(auth.verifyRequest(new Request("https://api.demo.example.com/profile"))).rejects.toMatchObject({
      code: "missing_bearer_token"
    });
  });
});
