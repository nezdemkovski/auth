import type { AuthProject } from "../config/projects";
import type { EmailSender } from "./cloudflare";

type BetterAuthUser = {
  email: string;
  name?: string | null;
};

export function createProjectEmailHandlers(options: {
  sender: EmailSender | null;
  project: AuthProject;
}) {
  const { sender, project } = options;

  if (!sender) {
    return {};
  }

  return {
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async (input: {
        user: BetterAuthUser;
        url: string;
      }) => {
        await sender.send({
          to: input.user.email,
          subject: `Verify your ${project.name} account`,
          html: renderActionEmail({
            title: `Verify your ${project.name} account`,
            intro: "Confirm this email address to finish setting up your account.",
            actionLabel: "Verify email",
            actionUrl: input.url
          }),
          text: renderTextEmail({
            title: `Verify your ${project.name} account`,
            intro: "Confirm this email address to finish setting up your account.",
            actionUrl: input.url
          })
        });
      }
    },
    emailAndPassword: {
      sendResetPassword: async (input: {
        user: BetterAuthUser;
        url: string;
      }) => {
        await sender.send({
          to: input.user.email,
          subject: `Reset your ${project.name} password`,
          html: renderActionEmail({
            title: `Reset your ${project.name} password`,
            intro: "Use this link to choose a new password. If you did not request it, you can ignore this email.",
            actionLabel: "Reset password",
            actionUrl: input.url
          }),
          text: renderTextEmail({
            title: `Reset your ${project.name} password`,
            intro: "Use this link to choose a new password. If you did not request it, you can ignore this email.",
            actionUrl: input.url
          })
        });
      }
    }
  };
}

function renderActionEmail(input: {
  title: string;
  intro: string;
  actionLabel: string;
  actionUrl: string;
}): string {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f4f7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0b1110;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border:1px solid #dbe4df;border-radius:18px;padding:32px;">
            <tr>
              <td>
                <h1 style="margin:0 0 12px;font-size:24px;line-height:1.2;color:#0b1110;">${escapeHtml(input.title)}</h1>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#4b5b53;">${escapeHtml(input.intro)}</p>
                <a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;background:#22c55e;color:#052e16;text-decoration:none;font-weight:700;border-radius:12px;padding:13px 18px;">${escapeHtml(input.actionLabel)}</a>
                <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#6b7a72;">If the button does not work, open this link:<br>${escapeHtml(input.actionUrl)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderTextEmail(input: {
  title: string;
  intro: string;
  actionUrl: string;
}): string {
  return `${input.title}

${input.intro}

${input.actionUrl}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#039;";
    }
  });
}
