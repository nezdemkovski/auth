import { describe, expect, test } from "bun:test";

import {
  DEFAULT_PROJECT_BILLING,
  DEFAULT_PROJECT_FEATURES,
  DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  DEFAULT_PROJECT_STORAGE
} from "../../../config/projects";
import { EmailProvider } from "../../../email/sender";
import { UsersService, UsersServiceError } from "../core";

const registered = {
  project: {
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
  },
  auth: {} as never,
  projectDb: {} as never
};

describe("users core", () => {
  test("refuses verification email resend when delivery is disabled", async () => {
    const service = new UsersService({
      adminProject: registered.project,
      getDeliverySettings: () => ({ provider: EmailProvider.None })
    });

    await expect(
      service.resendVerification(registered, "user@example.com")
    ).rejects.toMatchObject({
      code: "email_service_disabled",
      status: 409
    } satisfies Partial<UsersServiceError>);
  });
});
