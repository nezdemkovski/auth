import { describe, expect, test } from "bun:test";
import { generateKeyPair, SignJWT } from "jose";

import {
  createTelegramIdTokenVerification,
  createTelegramOidcPlugin,
  TELEGRAM_OIDC_ISSUER,
  telegramOidcUser
} from "../index";

describe("Telegram OIDC", () => {
  test("uses the official discovery document with PKCE and confidential client auth", () => {
    const plugin = createTelegramOidcPlugin({
      clientId: "telegram-client",
      clientSecret: "telegram-secret"
    });

    expect(plugin.options).toMatchObject({
      config: [
        {
          providerId: "telegram",
          discoveryUrl:
            "https://oauth.telegram.org/.well-known/openid-configuration",
          clientId: "telegram-client",
          clientSecret: "telegram-secret",
          authentication: "basic",
          scopes: ["openid", "profile"],
          pkce: true
        }
      ]
    });
  });

  test("accepts a valid Telegram ID token and uses the OIDC subject as identity", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const token = await telegramIdToken(privateKey, {
      sub: "telegram-subject",
      id: 123456789,
      name: "Demo User",
      picture: "https://demo.example.com/avatar.png"
    });
    const verification = createTelegramIdTokenVerification(
      "telegram-client",
      async () => publicKey
    );

    expect(await telegramOidcUser(token, verification)).toEqual({
      id: "telegram-subject",
      email: "telegram-telegram-subject@telegram.invalid",
      emailVerified: false,
      name: "Demo User",
      image: "https://demo.example.com/avatar.png"
    });
  });

  test("rejects Telegram ID tokens with an invalid signature or audience", async () => {
    const trusted = await generateKeyPair("RS256");
    const attacker = await generateKeyPair("RS256");
    const invalidSignature = await telegramIdToken(attacker.privateKey, {
      sub: "attacker"
    });
    const invalidAudience = await telegramIdToken(
      trusted.privateKey,
      { sub: "wrong-audience" },
      "different-client"
    );
    const verification = createTelegramIdTokenVerification(
      "telegram-client",
      async () => trusted.publicKey
    );

    expect(await telegramOidcUser(invalidSignature, verification)).toBeNull();
    expect(await telegramOidcUser(invalidAudience, verification)).toBeNull();
    expect(await telegramOidcUser("malformed", verification)).toBeNull();
  });
});

const telegramIdToken = (
  privateKey: CryptoKey,
  payload: Record<string, unknown>,
  audience = "telegram-client"
) => {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(TELEGRAM_OIDC_ISSUER)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
};
