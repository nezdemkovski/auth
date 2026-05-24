import { describe, expect, test } from "bun:test";

import {
  DEFAULT_PROJECT_BILLING,
  DEFAULT_PROJECT_FEATURES,
  DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  DEFAULT_PROJECT_STORAGE,
  type AuthProject
} from "../../../config/projects";
import { AuthRegistry } from "../../../auth/registry";
import { EmailProvider } from "../../../email/sender";
import { UsersService } from "../core";

const project: AuthProject = {
  slug: "openmarkers",
  name: "OpenMarkers",
  schema: "openmarkers_auth",
  description: "",
  iconUrl: "",
  appUrl: "",
  trustedOrigins: ["https://openmarkers.app"],
  features: DEFAULT_PROJECT_FEATURES,
  socialProviders: DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  billing: DEFAULT_PROJECT_BILLING,
  storage: DEFAULT_PROJECT_STORAGE
};

const createTestRegistry = () => {
  const registry = new AuthRegistry({
    databaseUrl: "postgres://auth:auth@127.0.0.1:5432/auth",
    publicBaseUrl: "https://auth.example.com",
    secret: "test-secret-with-enough-length-for-better-auth",
    emailSender: null,
    trustProxyHeaders: false,
    projects: [project]
  });
  const registered = registry.get(project.slug);

  if (!registered) {
    throw new Error("Test project was not registered");
  }

  return {
    registry,
    registered
  };
};

describe("users core", () => {
  test("refuses verification email resend when delivery is disabled", async () => {
    const { registry, registered } = createTestRegistry();
    const service = new UsersService({
      adminProject: registered.project,
      getDeliverySettings: () => ({ provider: EmailProvider.None })
    });

    try {
      await expect(
        service.resendVerification(registered, "user@example.com")
      ).rejects.toMatchObject({
        code: "email_service_disabled",
        status: 409
      });
    } finally {
      await registry.close();
    }
  });
});
