import { describe, expect, test } from "bun:test";

import { ADMIN_PROJECT } from "../src/config/projects";
import { createProjectEmailHandlers } from "../src/email/templates";
import type { EmailSender } from "../src/email/sender";

describe("project email handlers", () => {
  test("are disabled when no sender is configured", () => {
    expect(
      createProjectEmailHandlers({
        sender: null,
        project: ADMIN_PROJECT
      })
    ).toEqual({});
  });

  test("sends verification emails with project-specific subject and action URL", async () => {
    const sent: Parameters<EmailSender["send"]>[0][] = [];
    const sender: EmailSender = {
      async send(input) {
        sent.push(input);
      }
    };
    const handlers = createProjectEmailHandlers({
      sender,
      project: {
        ...ADMIN_PROJECT,
        name: "OpenMarkers"
      }
    });

    await handlers.emailVerification?.sendVerificationEmail({
      user: {
        email: "user@example.com"
      },
      url: "https://auth.example.com/api/openmarkers/auth/verify-email?token=token"
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("user@example.com");
    expect(sent[0].subject).toBe("Verify your OpenMarkers account");
    expect(sent[0].html).toContain("https://auth.example.com/api/openmarkers/auth");
    expect(sent[0].text).toContain("Confirm this email address");
  });

  test("sends password reset emails with a short expiry", async () => {
    const sent: Parameters<EmailSender["send"]>[0][] = [];
    const sender: EmailSender = {
      async send(input) {
        sent.push(input);
      }
    };
    const handlers = createProjectEmailHandlers({
      sender,
      project: {
        ...ADMIN_PROJECT,
        name: "OpenMarkers"
      }
    });

    await handlers.emailAndPassword?.sendResetPassword({
      user: {
        email: "user@example.com"
      },
      url: "https://auth.example.com/api/openmarkers/auth/reset-password/token"
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Reset your OpenMarkers password");
    expect(sent[0].text).toContain("It expires in 1 hour");
  });
});
