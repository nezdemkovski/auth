import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { pgTable, text } from "drizzle-orm/pg-core";
import { Pool } from "pg";

import { DIRECT_CLIENT_IP_HEADER } from "../src/http/security";
import {
  createIntegrationAdminSession,
  createIntegrationApp,
  integrationAdminProject,
  integrationDatabaseUrl,
  integrationPublicBaseUrl,
  readIntegrationJson,
  resetAndBootstrapIntegrationDatabase
} from "./setup";

const telegramConnections = pgTable("auth_telegram_mini_app_connections", {
  projectSlug: text("project_slug").primaryKey(),
  botUsername: text("bot_username").notNull(),
  botTokenCipher: text("bot_token_cipher").notNull()
});

describe("Telegram Mini App realm integration", () => {
  beforeEach(async () => {
    await resetAndBootstrapIntegrationDatabase();
  });

  test("connects one realm, creates a Better Auth session, and disconnects cleanly", async () => {
    const { app, registry, close } = await createIntegrationApp();
    const adminPool = new Pool({
      connectionString: integrationDatabaseUrl,
      options: `-c search_path="${integrationAdminProject.schema}",public`
    });
    const adminDb = drizzle({ client: adminPool });
    const connectedRealm = "telegram-connected";
    const otherRealm = "telegram-other";
    const botUsername = "integration_auth_bot";
    const botToken = "123456789:integration-telegram-bot-token";

    try {
      const { cookie } = await createIntegrationAdminSession({
        app,
        registry,
        email: "telegram-admin@integration.test"
      });
      await createRealm(app, cookie, connectedRealm);
      await createRealm(app, cookie, otherRealm);

      const connect = await app.request(
        `/admin/api/projects/${connectedRealm}/integrations/telegram-mini-app`,
        {
          method: "PUT",
          headers: adminHeaders(cookie),
          body: JSON.stringify({ botUsername, botToken })
        }
      );
      expect(connect.status).toBe(200);
      expect(await readIntegrationJson(connect)).toEqual({
        connection: {
          enabled: true,
          botUsername
        }
      });

      const readConnection = await app.request(
        `/admin/api/projects/${connectedRealm}/integrations/telegram-mini-app`,
        { headers: adminHeaders(cookie) }
      );
      expect(readConnection.status).toBe(200);
      expect(await readIntegrationJson(readConnection)).toEqual({
        connection: {
          enabled: true,
          botUsername
        }
      });

      const stored = await adminDb
        .select()
        .from(telegramConnections);
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        projectSlug: connectedRealm,
        botUsername
      });
      expect(stored[0]?.botTokenCipher).toStartWith("v1:");
      expect(stored[0]?.botTokenCipher).not.toContain(botToken);

      const initData = telegramInitData(botToken, {
        id: 830000001,
        first_name: "Demo",
        last_name: "User",
        username: "demo_user"
      });
      const invalidSignature = await signInWithInitData(
        app,
        connectedRealm,
        telegramInitData("987654321:another-bot-token-for-integration", {
          id: 830000001,
          first_name: "Demo",
          last_name: "User",
          username: "demo_user"
        })
      );
      expect(invalidSignature.status).toBe(401);

      const expired = await signInWithInitData(
        app,
        connectedRealm,
        telegramInitData(
          botToken,
          {
            id: 830000001,
            first_name: "Demo",
            last_name: "User",
            username: "demo_user"
          },
          Math.floor(Date.now() / 1000) - 301
        )
      );
      expect(expired.status).toBe(401);

      const trustedPreflight = await telegramPreflight(
        app,
        connectedRealm,
        `https://${connectedRealm}.integration.test`
      );
      expect(trustedPreflight.headers.get("access-control-allow-origin")).toBe(
        `https://${connectedRealm}.integration.test`
      );
      const untrustedPreflight = await telegramPreflight(
        app,
        connectedRealm,
        "https://untrusted.integration.test"
      );
      expect(
        untrustedPreflight.headers.has("access-control-allow-origin")
      ).toBe(false);

      const signIn = await app.request(
        `/api/${connectedRealm}/auth/telegram/miniapp/signin`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: `https://${connectedRealm}.integration.test`,
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          },
          body: JSON.stringify({ initData })
        }
      );
      expect(signIn.status).toBe(200);
      expect(signIn.headers.get("set-cookie")).toContain(
        `auth_${connectedRealm}.session_token=`
      );
      expect(await readIntegrationJson(signIn)).toMatchObject({
        user: {
          name: "Demo User",
          email: "830000001@telegram.invalid",
          telegramId: "830000001",
          telegramUsername: "demo_user"
        }
      });

      const authorizationURL =
        `${integrationPublicBaseUrl}/api/${connectedRealm}/oauth2/authorize` +
        "?client_id=demo&state=integration-state";
      const browserHandoff = await app.request(
        `/api/${connectedRealm}/auth/telegram/miniapp/signin`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Origin: `https://${connectedRealm}.integration.test`,
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          },
          body: new URLSearchParams({
            initData,
            callbackURL: authorizationURL
          }).toString()
        }
      );
      expect(browserHandoff.status).toBe(302);
      expect(browserHandoff.headers.get("location")).toBe(authorizationURL);
      expect(browserHandoff.headers.get("set-cookie")).toContain(
        `auth_${connectedRealm}.session_token=`
      );

      const untrustedHandoff = await app.request(
        `/api/${connectedRealm}/auth/telegram/miniapp/signin`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Origin: "https://untrusted.integration.test",
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          },
          body: new URLSearchParams({
            initData,
            callbackURL: authorizationURL
          }).toString()
        }
      );
      expect(untrustedHandoff.status).toBe(403);

      const wrongRealm = await app.request(
        `/api/${otherRealm}/auth/telegram/miniapp/signin`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: `https://${otherRealm}.integration.test`,
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          },
          body: JSON.stringify({ initData })
        }
      );
      expect(wrongRealm.status).toBe(404);

      const disconnect = await app.request(
        `/admin/api/projects/${connectedRealm}/integrations/telegram-mini-app`,
        {
          method: "DELETE",
          headers: adminHeaders(cookie)
        }
      );
      expect(disconnect.status).toBe(204);

      const afterDisconnect = await app.request(
        `/api/${connectedRealm}/auth/telegram/miniapp/signin`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: `https://${connectedRealm}.integration.test`,
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          },
          body: JSON.stringify({ initData })
        }
      );
      expect(afterDisconnect.status).toBe(404);
      expect(await adminDb.select().from(telegramConnections)).toEqual([]);
    } finally {
      await adminPool.end();
      await close();
    }
  });
});

const createRealm = async (
  app: Awaited<ReturnType<typeof createIntegrationApp>>["app"],
  cookie: string,
  slug: string
) => {
  const response = await app.request("/admin/api/projects", {
    method: "POST",
    headers: adminHeaders(cookie),
    body: JSON.stringify({
      slug,
      name: "Demo App",
      appUrl: `https://${slug}.integration.test`
    })
  });

  expect(response.status).toBe(201);
};

const adminHeaders = (cookie: string) => ({
  "Content-Type": "application/json",
  Cookie: cookie,
  Origin: integrationPublicBaseUrl,
  [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
});

const signInWithInitData = (
  app: Awaited<ReturnType<typeof createIntegrationApp>>["app"],
  realm: string,
  initData: string,
  origin = `https://${realm}.integration.test`
) =>
  app.request(`/api/${realm}/auth/telegram/miniapp/signin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
    },
    body: JSON.stringify({ initData })
  });

const telegramPreflight = (
  app: Awaited<ReturnType<typeof createIntegrationApp>>["app"],
  realm: string,
  origin: string
) =>
  app.request(`/api/${realm}/auth/telegram/miniapp/signin`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type"
    }
  });

const telegramInitData = (
  botToken: string,
  user: {
    id: number;
    first_name: string;
    last_name: string;
    username: string;
  },
  authDate = Math.floor(Date.now() / 1000)
) => {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: "integration-query-id",
    user: JSON.stringify(user)
  });
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const hash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");
  params.set("hash", hash);

  return params.toString();
};
