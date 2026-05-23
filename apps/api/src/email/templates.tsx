import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Section,
  Text
} from "@react-email/components";
import { render } from "@react-email/render";

import type { AuthProject } from "../config/projects";
import type { EmailSender } from "./sender";

export const VERIFICATION_EXPIRY_HOURS = 24;
export const RESET_EXPIRY_HOURS = 1;
export const SOURCE_URL = "https://github.com/nezdemkovski/auth";

type BetterAuthUser = {
  email: string;
  name?: string | null;
};

type ActionEmailProps = {
  projectName: string;
  eyebrow: string;
  headlineLead: string;
  headlineEm: string;
  preview: string;
  intro: string;
  actionLabel: string;
  actionUrl: string;
  expiryHours: number;
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
      expiresIn: VERIFICATION_EXPIRY_HOURS * 60 * 60,
      sendVerificationEmail: async (input: {
        user: BetterAuthUser;
        url: string;
      }) => {
        const subject = `Verify your ${project.name} account`;
        const email = await renderActionEmail({
          projectName: project.name,
          eyebrow: "Verify",
          headlineLead: "Verify your",
          headlineEm: "account.",
          preview: `Confirm your email address for ${project.name}.`,
          intro: `Confirm this email address to finish setting up your account. The link stays valid for ${VERIFICATION_EXPIRY_HOURS} hours.`,
          actionLabel: "Verify email →",
          actionUrl: input.url,
          expiryHours: VERIFICATION_EXPIRY_HOURS
        });

        await sender.send({
          to: input.user.email,
          subject,
          ...email
        });
      }
    },
    user: {
      changeEmail: {
        enabled: true
      }
    },
    emailAndPassword: {
      resetPasswordTokenExpiresIn: RESET_EXPIRY_HOURS * 60 * 60,
      sendResetPassword: async (input: {
        user: BetterAuthUser;
        url: string;
      }) => {
        const subject = `Reset your ${project.name} password`;
        const email = await renderActionEmail({
          projectName: project.name,
          eyebrow: "Reset",
          headlineLead: "Reset your",
          headlineEm: "password.",
          preview: `Choose a new password for ${project.name}.`,
          intro: `Use the link below to choose a new password. It expires in ${RESET_EXPIRY_HOURS} hour. If you did not request it, you can safely ignore this email.`,
          actionLabel: "Reset password →",
          actionUrl: input.url,
          expiryHours: RESET_EXPIRY_HOURS
        });

        await sender.send({
          to: input.user.email,
          subject,
          ...email
        });
      }
    }
  };
}

async function renderActionEmail(input: ActionEmailProps): Promise<{
  html: string;
  text: string;
}> {
  const node = <ActionEmail {...input} />;

  const [html, text] = await Promise.all([
    render(node),
    render(node, {
      plainText: true
    })
  ]);

  return {
    html,
    text
  };
}

export function ActionEmail({
  projectName,
  eyebrow,
  headlineLead,
  headlineEm,
  preview,
  intro,
  actionLabel,
  actionUrl,
  expiryHours
}: ActionEmailProps) {
  const initial = projectName.trim().charAt(0).toUpperCase() || "·";
  return (
    <Html>
      <Head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.brand}>
            <Text style={styles.brandMark}>{initial}</Text>
            <Text style={styles.brandText}>{projectName}</Text>
          </Section>

          <table
            role="presentation"
            cellPadding={0}
            cellSpacing={0}
            border={0}
            width="100%"
            style={styles.eyebrowRow}
          >
            <tbody>
              <tr>
                <td style={styles.eyebrowLabel}>{eyebrow.toUpperCase()}</td>
                <td style={styles.eyebrowRule}>
                  <div style={styles.eyebrowRuleLine} />
                </td>
              </tr>
            </tbody>
          </table>

          <Text style={styles.headline}>
            {headlineLead}{" "}
            <em style={styles.headlineEm}>{headlineEm}</em>
          </Text>

          <Text style={styles.intro}>{intro}</Text>

          <Section style={styles.buttonWrap}>
            <Button href={actionUrl} style={styles.button}>
              {actionLabel}
            </Button>
          </Section>

          <Text style={styles.helpText}>
            If the button does not work, open this link:
          </Text>
          <Link href={actionUrl} style={styles.link}>
            {actionUrl}
          </Link>

          <div style={styles.footerSpacer} />

          <table
            role="presentation"
            cellPadding={0}
            cellSpacing={0}
            border={0}
            width="100%"
          >
            <tbody>
              <tr>
                <td style={styles.footerLeft}>
                  ↳ SINGLE-USE LINK · {expiryHours}H EXPIRY
                </td>
                <td style={styles.footerRight}>
                  {projectName.toUpperCase()} / AUTH
                </td>
              </tr>
            </tbody>
          </table>
        </Container>
      </Body>
    </Html>
  );
}

const colors = {
  background: "#fafaf9",
  panel: "#ffffff",
  ink: "#0c0a09",
  inkSoft: "#292524",
  muted: "#57534e",
  soft: "#78716c",
  mutedSoft: "#a8a29e",
  border: "#e7e5e4",
  accent: "#0c0a09",
  accentInk: "#fafaf9"
};

const fontStacks = {
  sans:
    "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  serif:
    "'Instrument Serif', Cambria, Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
};

const styles = {
  body: {
    margin: 0,
    backgroundColor: colors.background,
    color: colors.ink,
    fontFamily: fontStacks.sans
  },
  container: {
    maxWidth: "520px",
    margin: "48px auto",
    padding: "36px 36px 28px",
    backgroundColor: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: "14px"
  },
  brand: {
    marginBottom: "28px"
  },
  brandMark: {
    display: "inline-block",
    width: "28px",
    height: "28px",
    margin: "0 10px 0 0",
    borderRadius: "7px",
    backgroundColor: colors.accent,
    color: colors.accentInk,
    fontSize: "13px",
    fontWeight: 600,
    lineHeight: "28px",
    textAlign: "center" as const,
    letterSpacing: "-0.02em"
  },
  brandText: {
    display: "inline-block",
    margin: 0,
    color: colors.inkSoft,
    fontSize: "13.5px",
    fontWeight: 500,
    lineHeight: "28px",
    verticalAlign: "top",
    letterSpacing: "-0.005em"
  },
  eyebrowRow: {
    marginBottom: "12px"
  },
  eyebrowLabel: {
    fontFamily: fontStacks.mono,
    fontSize: "11px",
    fontWeight: 400,
    letterSpacing: "0.08em",
    color: colors.muted,
    whiteSpace: "nowrap" as const,
    paddingRight: "12px",
    verticalAlign: "middle" as const
  },
  eyebrowRule: {
    width: "100%",
    verticalAlign: "middle" as const
  },
  eyebrowRuleLine: {
    height: "1px",
    backgroundColor: colors.border,
    width: "100%"
  },
  headline: {
    margin: "0 0 16px",
    color: colors.ink,
    fontFamily: fontStacks.serif,
    fontWeight: 400,
    fontSize: "44px",
    lineHeight: "1.02",
    letterSpacing: "-0.02em"
  },
  headlineEm: {
    fontStyle: "italic" as const,
    fontWeight: 400
  },
  intro: {
    margin: "0 0 28px",
    color: colors.muted,
    fontSize: "15px",
    lineHeight: "1.55"
  },
  buttonWrap: {
    margin: "0 0 28px"
  },
  button: {
    display: "inline-block",
    padding: "11px 20px",
    borderRadius: "8px",
    backgroundColor: colors.accent,
    color: colors.accentInk,
    fontSize: "14px",
    fontWeight: 500,
    textDecoration: "none",
    letterSpacing: "-0.005em"
  },
  footerSpacer: {
    height: "32px"
  },
  helpText: {
    margin: "0 0 6px",
    color: colors.soft,
    fontSize: "13px",
    lineHeight: "1.5"
  },
  link: {
    fontFamily: fontStacks.mono,
    color: colors.inkSoft,
    fontSize: "12.5px",
    lineHeight: "1.5",
    wordBreak: "break-all" as const,
    textDecoration: "underline",
    textUnderlineOffset: "2px"
  },
  footerLeft: {
    fontFamily: fontStacks.mono,
    fontSize: "10.5px",
    letterSpacing: "0.08em",
    color: colors.mutedSoft,
    textAlign: "left" as const
  },
  footerRight: {
    fontFamily: fontStacks.mono,
    fontSize: "10.5px",
    letterSpacing: "0.08em",
    color: colors.mutedSoft,
    textAlign: "right" as const,
    whiteSpace: "nowrap" as const,
    paddingLeft: "12px"
  },
  footerLink: {
    color: colors.muted,
    textDecoration: "underline",
    textUnderlineOffset: "2px"
  }
};
