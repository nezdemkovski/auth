import { describe, expect, test } from "bun:test";
import {
  DEFAULT_REALM_FEATURES,
  DEFAULT_REALM_SOCIAL_PROVIDERS,
  RealmTwoFactorRequirement,
  type Realm
} from "@nezdemkovski/auth-realm";
import { betterAuth } from "better-auth";

import {
  createBaseProjectAuthOptions,
  createProjectMigrationAuthOptions,
  projectAuthSecret,
  type ProjectAuthProtocolOptions
} from "../index";

const baseRealm: Realm = {
  slug: "demo",
  name: "Demo App",
  schema: "demo_auth",
  description: "Demo realm",
  iconUrl: "",
  appUrl: "https://demo.example.com",
  trustedOrigins: ["https://demo.example.com"],
  features: DEFAULT_REALM_FEATURES,
  socialProviders: DEFAULT_REALM_SOCIAL_PROVIDERS
};

const protocol: ProjectAuthProtocolOptions<Realm> = {
  oauthProvider: {
    scopes: ["openid", "profile", "email", "offline_access"],
    dynamicClientScopes: ["openid", "profile", "email", "offline_access"],
    resources: (project) => [
      {
        identifier: `https://auth.example.com/api/${project.slug}/resource`,
        allowedScopes: ["resource:read"]
      }
    ],
    userAccessTokenClaims: {
      "https://auth.example.com/claims/token-kind": "user"
    },
    serviceAccessTokenClaims: {
      "https://auth.example.com/claims/token-kind": "service"
    }
  }
};

const createOptions = (realm: Realm, trustProxyHeaders = false) => {
  return createBaseProjectAuthOptions({
    project: realm,
    publicBaseUrl: "https://auth.example.com",
    secret: "x".repeat(32),
    trustedClientIpHeader: "x-demo-client-ip",
    trustProxyHeaders,
    protocol
  });
};

const createMigrationOptions = (realm: Realm) => {
  return createProjectMigrationAuthOptions({
    project: realm,
    database: undefined,
    publicBaseUrl: "https://auth.example.com",
    secret: "x".repeat(32),
    trustedClientIpHeader: "x-demo-client-ip",
    protocol
  });
};

describe("project auth options", () => {
  test("pins the OAuth provider to the Better Auth release candidate", async () => {
    const manifest = await Bun.file(
      new URL("../../package.json", import.meta.url)
    ).json();

    expect(manifest.dependencies["@better-auth/oauth-provider"]).toBe(
      "1.7.0-rc.1"
    );
    expect(manifest.dependencies["@better-auth/cimd"]).toBe("1.7.0-rc.1");
  });

  test("builds isolated Better Auth settings per realm", () => {
    const options = createOptions(baseRealm);

    expect(options.appName).toBe("Demo App");
    expect(options.baseURL).toBe("https://auth.example.com/api/demo/auth");
    expect(options.trustedOrigins).toEqual(["https://demo.example.com"]);
    expect(options.advanced?.cookiePrefix).toBe("auth_demo");
    expect(options.secret).toBe(projectAuthSecret("x".repeat(32), "demo"));
    expect(options.secret).not.toBe("x".repeat(32));
  });

  test("applies prebuilt email handlers supplied by the composition root", () => {
    const options = createBaseProjectAuthOptions({
      project: baseRealm,
      publicBaseUrl: "https://auth.example.com",
      secret: "x".repeat(32),
      trustedClientIpHeader: "x-demo-client-ip",
      trustProxyHeaders: false,
      protocol,
      emailContribution: () => ({
        emailAndPassword: {
          requireEmailVerification: true
        }
      })
    });

    expect(options.emailAndPassword?.requireEmailVerification).toBe(true);
    expect(createOptions(baseRealm).emailAndPassword?.requireEmailVerification)
      .toBeUndefined();
  });

  test("wires the official security-sensitive plugins", () => {
    const options = createMigrationOptions(baseRealm);
    const pluginIds = (options.plugins ?? []).map((plugin) => plugin.id);

    expect(options.disabledPaths).toEqual(["/token"]);
    expect(pluginIds).toContain("admin");
    expect(pluginIds).toContain("passkey");
    expect(pluginIds).toContain("two-factor");
    expect(pluginIds).toContain("agent-auth");
    expect(pluginIds).toContain("oauth-provider");
    expect(pluginIds).toContain("cimd");
    expect(pluginIds).toContain("last-login-method");
    expect(pluginIds).toContain("bearer");
    expect(pluginIds).toContain("jwt");
    expect(pluginIds).not.toContain("polar");
    expect(pluginIds).not.toContain("test-utils");
  });

  test("applies optional plugins supplied by the composition root", () => {
    const options = createBaseProjectAuthOptions({
      project: baseRealm,
      publicBaseUrl: "https://auth.example.com",
      secret: "x".repeat(32),
      trustedClientIpHeader: "x-demo-client-ip",
      trustProxyHeaders: false,
      protocol,
      pluginContributions: [() => [{ id: "demo-contribution" }]]
    });

    expect(options.plugins?.map((plugin) => plugin.id)).toContain(
      "demo-contribution"
    );
  });

  test("configures Telegram through Better Auth Generic OAuth with OIDC and PKCE", () => {
    const disabledPluginIds = (createOptions(baseRealm).plugins ?? []).map(
      (plugin) => plugin.id
    );
    const enabledPlugins = createOptions({
      ...baseRealm,
      socialProviders: {
        ...DEFAULT_REALM_SOCIAL_PROVIDERS,
        telegram: {
          enabled: true,
          clientId: "telegram-client",
          clientSecret: "telegram-oidc-secret",
          verifiedAt: null
        }
      }
    }).plugins ?? [];
    const telegramPlugin = enabledPlugins.find(
      (plugin) => plugin.id === "generic-oauth"
    );
    const telegramOptions = telegramPlugin
      ? Reflect.get(telegramPlugin, "options")
      : null;

    expect(disabledPluginIds).not.toContain("generic-oauth");
    expect(telegramOptions).toMatchObject({
      config: [
        {
          providerId: "telegram",
          discoveryUrl:
            "https://oauth.telegram.org/.well-known/openid-configuration",
          clientId: "telegram-client",
          clientSecret: "telegram-oidc-secret",
          authentication: "basic",
          scopes: ["openid", "profile"],
          pkce: true
        }
      ]
    });
  });

  test("trusts proxy IP headers only when explicitly enabled", () => {
    expect(createOptions(baseRealm).advanced?.ipAddress).toBeUndefined();
    expect(createOptions(baseRealm, true).advanced?.ipAddress).toEqual({
      ipAddressHeaders: ["x-demo-client-ip"]
    });
  });

  test("uses protocol resources only when the realm enables OAuth resources", () => {
    const oauthRealm = {
      ...baseRealm,
      features: {
        ...baseRealm.features,
        oauthProvider: {
          enabled: true,
          dynamicClientRegistration: false
        }
      }
    };
    const oauthPlugin = (createMigrationOptions(oauthRealm).plugins ?? [])
      .find((plugin) => plugin.id === "oauth-provider");
    const oauthOptions = oauthPlugin
      ? Reflect.get(oauthPlugin, "options")
      : null;

    expect(oauthOptions).toMatchObject({
      scopes: protocol.oauthProvider.scopes,
      resources: protocol.oauthProvider.resources(oauthRealm),
      allowDynamicClientRegistration: false,
      allowUnauthenticatedClientRegistration: false,
      resourceSeedMode: "overwrite",
      enforcePerClientResources: true,
      clientRegistrationDefaultScopes:
        protocol.oauthProvider.dynamicClientScopes,
      clientRegistrationAllowedScopes:
        protocol.oauthProvider.dynamicClientScopes
    });
    expect(
      (createMigrationOptions(oauthRealm).plugins ?? []).map(
        (plugin) => plugin.id
      )
    ).toContain("cimd");

    const disabledPlugin = (createMigrationOptions(baseRealm).plugins ?? [])
      .find((plugin) => plugin.id === "oauth-provider");
    const disabledOptions = disabledPlugin
      ? Reflect.get(disabledPlugin, "options")
      : null;
    expect(disabledOptions ? Reflect.get(disabledOptions, "resources") : null)
      .toEqual([]);
  });

  test("advertises secure zero-registration MCP client discovery", async () => {
    const oauthRealm = {
      ...baseRealm,
      features: {
        ...baseRealm.features,
        oauthProvider: {
          enabled: true,
          dynamicClientRegistration: false
        }
      }
    };
    const auth = betterAuth(createMigrationOptions(oauthRealm));
    const getOAuthServerConfig = Reflect.get(
      auth.api,
      "getOAuthServerConfig"
    );
    if (typeof getOAuthServerConfig !== "function") {
      throw new Error("Expected OAuth authorization server metadata endpoint");
    }
    const metadata: unknown = await getOAuthServerConfig({
      request: new Request(
        "https://auth.example.com/api/demo/.well-known/oauth-authorization-server"
      ),
      asResponse: false
    });
    if (!isRecord(metadata)) {
      throw new Error("Expected OAuth authorization server metadata");
    }

    expect(metadata.client_id_metadata_document_supported).toBe(true);
    expect(metadata.registration_endpoint).toBeUndefined();
  });

  test("uses the OAuth Provider post-login hook for realm security policy", async () => {
    const realm = {
      ...baseRealm,
      features: {
        ...DEFAULT_REALM_FEATURES,
        twoFactor: {
          enabled: true,
          required: RealmTwoFactorRequirement.Everyone
        }
      }
    };
    const oauthPlugin = (createMigrationOptions(realm).plugins ?? [])
      .find((plugin) => plugin.id === "oauth-provider");
    const oauthOptions = oauthPlugin
      ? Reflect.get(oauthPlugin, "options")
      : null;
    const postLogin = oauthOptions
      ? Reflect.get(oauthOptions, "postLogin")
      : null;

    if (!postLogin) {
      throw new Error("Expected OAuth Provider post-login configuration");
    }

    const session = {
      id: "session-id",
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: "user-id",
      expiresAt: new Date(Date.now() + 60_000),
      token: "session-token"
    };
    const user = {
      id: "user-id",
      createdAt: new Date(),
      updatedAt: new Date(),
      email: "user@example.com",
      emailVerified: true,
      name: "Demo User",
      role: "user"
    };
    const shouldRedirectBeforeEnrollment = await postLogin.shouldRedirect({
      headers: new Headers(),
      scopes: ["openid"],
      session,
      user: {
        ...user,
        twoFactorEnabled: false
      }
    });
    const shouldRedirectAfterEnrollment = await postLogin.shouldRedirect({
      headers: new Headers(),
      scopes: ["openid"],
      session,
      user: {
        ...user,
        twoFactorEnabled: true
      }
    });

    expect(shouldRedirectBeforeEnrollment).toBe(true);
    expect(shouldRedirectAfterEnrollment).toBe(false);
  });

  test("enables social providers only when enabled and fully configured", () => {
    const options = createOptions({
      ...baseRealm,
      socialProviders: {
        ...DEFAULT_REALM_SOCIAL_PROVIDERS,
        github: {
          enabled: true,
          clientId: "github-client",
          clientSecret: "github-secret",
          verifiedAt: null
        },
        google: {
          enabled: true,
          clientId: "google-client",
          clientSecret: "",
          verifiedAt: null
        }
      }
    });

    expect(options.socialProviders?.github).toEqual({
      enabled: true,
      clientId: "github-client",
      clientSecret: "github-secret"
    });
    expect(providerEnabled(options.socialProviders?.google)).toBe(false);
    expect(providerEnabled(options.socialProviders?.twitter)).toBe(false);
    expect(providerEnabled(options.socialProviders?.facebook)).toBe(false);
  });
});

const providerEnabled = (provider: unknown) => {
  if (
    typeof provider === "object" &&
    provider !== null &&
    "enabled" in provider
  ) {
    return provider.enabled === true;
  }

  return false;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
