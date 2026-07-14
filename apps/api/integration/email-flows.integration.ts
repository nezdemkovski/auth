import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { EmailProvider } from "@nezdemkovski/auth-delivery";

import { DIRECT_CLIENT_IP_HEADER } from "../src/http/security";
import {
  bootstrapIntegrationDatabase,
  createIntegrationApp,
  integrationAdminEmail,
  integrationPublicBaseUrl,
  readIntegrationJson,
  resetAndBootstrapIntegrationDatabase,
  resetIntegrationDatabase,
  signInIntegrationUser,
  signUpIntegrationUser
} from "./setup";
import { seedIntegrationRealm } from "./seed";

describe("email auth flows integration", () => {
  beforeEach(async () => {
    await resetAndBootstrapIntegrationDatabase();
  });

  test("sends and verifies signup email links for the correct realm", async () => {
    const sent = captureResendEmails();
    const project = await seedIntegrationRealm({
      slug: "integration-email",
      schema: "integration_email_auth",
      name: "Integration Email"
    });
    const { app, close } = await createIntegrationApp({
      email: {
        provider: EmailProvider.Resend,
        apiKey: "re_test_key",
        from: "Auth <auth@example.test>"
      }
    });

    try {
      const { cookie } = await signUpIntegrationUser({
        app,
        projectSlug: project.slug,
        origin: project.appUrl,
        email: "verify-user@integration.test",
        password: "correct horse battery staple",
        name: "Verify User",
        expectSession: false
      });

      expect(sent.emails).toHaveLength(1);
      expect(sent.emails[0]).toMatchObject({
        from: "Auth <auth@example.test>",
        to: "verify-user@integration.test",
        subject: "Verify your Integration Email account"
      });
      const verifyUrl = extractUrl(sent.emails[0].text, "/verify-email");
      expect(verifyUrl.startsWith(`http://127.0.0.1:3000/api/${project.slug}/auth/verify-email`))
        .toBe(true);
      expect(new URL(verifyUrl).searchParams.get("callbackURL")).toBe("/");

      const beforeVerify = await app.request(
        `/api/${project.slug}/auth/get-session`,
        {
          headers: {
            Cookie: cookie,
            Origin: project.appUrl,
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          }
        }
      );
      expect(cookie).toBe("");
      expect(await beforeVerify.json()).toBeNull();

      const verified = await app.request(toAppPath(verifyUrl), {
        headers: {
          Origin: project.appUrl,
          [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
        },
        redirect: "manual"
      });
      expect(verified.status).toBe(302);
      expect(verified.headers.get("location")).toBe("/");
      expect(verified.headers.get("set-cookie")).toBeNull();
      const { cookie: verifiedCookie } = await signInIntegrationUser({
        app,
        projectSlug: project.slug,
        origin: project.appUrl,
        email: "verify-user@integration.test",
        password: "correct horse battery staple"
      });

      const afterVerify = await app.request(
        `/api/${project.slug}/auth/get-session`,
        {
          headers: {
            Cookie: verifiedCookie,
            Origin: project.appUrl,
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          }
        }
      );
      expect(await readIntegrationJson(afterVerify)).toMatchObject({
        user: {
          emailVerified: true
        }
      });
    } finally {
      await close();
      sent.restore();
    }
  });

  test("the bootstrap admin can sign in while email delivery is enabled", async () => {
    await resetIntegrationDatabase();
    const info = spyOn(console, "info").mockImplementation(() => {});
    let temporaryPassword = "";
    try {
      await bootstrapIntegrationDatabase();
      const credentialLine = info.mock.calls
        .map(([message]) => String(message))
        .find((message) => message.includes("temporary admin password:"));
      temporaryPassword =
        credentialLine?.split("temporary admin password: ")[1] ?? "";
    } finally {
      info.mockRestore();
    }
    expect(temporaryPassword).not.toBe("");

    const sent = captureResendEmails();
    const { app, close } = await createIntegrationApp({
      email: {
        provider: EmailProvider.Resend,
        apiKey: "re_test_key",
        from: "Auth <auth@example.test>"
      }
    });

    try {
      const response = await app.request("/api/admin/auth/sign-in/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: integrationPublicBaseUrl,
          [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
        },
        body: JSON.stringify({
          email: integrationAdminEmail,
          password: temporaryPassword
        })
      });

      expect(response.status).toBe(200);
    } finally {
      await close();
      sent.restore();
    }
  });

  test("resets passwords through emailed reset links without accepting the old password", async () => {
    const sent = captureResendEmails();
    const project = await seedIntegrationRealm({
      slug: "integration-reset",
      schema: "integration_reset_auth",
      name: "Integration Reset"
    });
    const { app, close } = await createIntegrationApp({
      email: {
        provider: EmailProvider.Resend,
        apiKey: "re_test_key",
        from: "Auth <auth@example.test>"
      }
    });

    try {
      await signUpIntegrationUser({
        app,
        projectSlug: project.slug,
        origin: project.appUrl,
        email: "reset-user@integration.test",
        password: "old correct horse battery staple",
        name: "Reset User",
        expectSession: false
      });
      const verificationLink = extractUrl(sent.emails[0].text, "/verify-email");
      const verified = await app.request(toAppPath(verificationLink), {
        headers: {
          Origin: project.appUrl,
          [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
        },
        redirect: "manual"
      });
      expect(verified.status).toBe(302);
      sent.emails.length = 0;

      const requested = await app.request(
        `/api/${project.slug}/auth/request-password-reset`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: project.appUrl,
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          },
          body: JSON.stringify({
            email: "reset-user@integration.test",
            redirectTo: `${project.appUrl}/reset-password`
          })
        }
      );
      expect(requested.status).toBe(200);
      expect(sent.emails).toHaveLength(1);
      expect(sent.emails[0].subject).toBe("Reset your Integration Reset password");

      const resetLink = extractUrl(sent.emails[0].text, "/reset-password/");
      const callback = await app.request(toAppPath(resetLink), {
        headers: {
          Origin: project.appUrl,
          [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
        },
        redirect: "manual"
      });
      expect(callback.status).toBe(302);
      const resetToken = new URL(callback.headers.get("location") ?? "").searchParams.get("token") ?? "";
      expect(resetToken.length).toBeGreaterThan(0);

      const reset = await app.request(
        `/api/${project.slug}/auth/reset-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: project.appUrl,
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          },
          body: JSON.stringify({
            token: resetToken,
            newPassword: "new correct horse battery staple"
          })
        }
      );
      expect(reset.status).toBe(200);
      expect(await readIntegrationJson(reset)).toMatchObject({ status: true });

      const oldPassword = await app.request(
        `/api/${project.slug}/auth/sign-in/email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: project.appUrl,
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          },
          body: JSON.stringify({
            email: "reset-user@integration.test",
            password: "old correct horse battery staple"
          })
        }
      );
      expect(oldPassword.status).toBe(401);

      await expect(
        signInIntegrationUser({
          app,
          projectSlug: project.slug,
          origin: project.appUrl,
          email: "reset-user@integration.test",
          password: "new correct horse battery staple"
        })
      ).resolves.toMatchObject({
        cookie: expect.stringContaining("=")
      });
    } finally {
      await close();
      sent.restore();
    }
  });
});

type SentEmail = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

const captureResendEmails = () => {
  const emails: SentEmail[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url === "https://api.resend.com/emails") {
      const body = JSON.parse(String(init?.body));
      emails.push(body);
      return new Response(JSON.stringify({ id: `email-${emails.length}` }), {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }

    return originalFetch(input, init);
  };

  return {
    emails,
    restore: () => {
      globalThis.fetch = originalFetch;
    }
  };
};

const extractUrl = (text: string, pathFragment: string) => {
  const urls = text.match(/https?:\/\/\S+/g) ?? [];
  const found = urls.find((url) => url.includes(pathFragment));
  if (!found) {
    throw new Error(`Expected email to include ${pathFragment} URL`);
  }

  return found.replace(/[).,]+$/, "");
};

const toAppPath = (absoluteUrl: string) => {
  const url = new URL(absoluteUrl);
  return `${url.pathname}${url.search}`;
};
