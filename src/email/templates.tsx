import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text
} from "@react-email/components";
import { render } from "@react-email/render";

import type { AuthProject } from "../config/projects";
import type { EmailSender } from "./sender";

type BetterAuthUser = {
  email: string;
  name?: string | null;
};

type ActionEmailProps = {
  projectName: string;
  title: string;
  preview: string;
  intro: string;
  actionLabel: string;
  actionUrl: string;
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
        const subject = `Verify your ${project.name} account`;
        const email = await renderActionEmail({
          projectName: project.name,
          title: subject,
          preview: `Confirm your email address for ${project.name}.`,
          intro: "Confirm this email address to finish setting up your account.",
          actionLabel: "Verify email",
          actionUrl: input.url
        });

        await sender.send({
          to: input.user.email,
          subject,
          ...email
        });
      }
    },
    emailAndPassword: {
      sendResetPassword: async (input: {
        user: BetterAuthUser;
        url: string;
      }) => {
        const subject = `Reset your ${project.name} password`;
        const email = await renderActionEmail({
          projectName: project.name,
          title: subject,
          preview: `Choose a new password for ${project.name}.`,
          intro:
            "Use this link to choose a new password. If you did not request it, you can ignore this email.",
          actionLabel: "Reset password",
          actionUrl: input.url
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
  title,
  preview,
  intro,
  actionLabel,
  actionUrl
}: ActionEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.brand}>
            <Text style={styles.brandMark}>A</Text>
            <Text style={styles.brandText}>{projectName}</Text>
          </Section>

          <Heading style={styles.heading}>{title}</Heading>
          <Text style={styles.intro}>{intro}</Text>

          <Button href={actionUrl} style={styles.button}>
            {actionLabel}
          </Button>

          <Hr style={styles.hr} />

          <Text style={styles.helpText}>
            If the button does not work, open this link:
          </Text>
          <Link href={actionUrl} style={styles.link}>
            {actionUrl}
          </Link>
        </Container>
      </Body>
    </Html>
  );
}

const colors = {
  background: "#fafafa",
  panel: "#ffffff",
  ink: "#18181b",
  inkSoft: "#3f3f46",
  muted: "#52525b",
  soft: "#71717a",
  border: "#e7e7ea",
  accent: "#18181b",
  accentInk: "#ffffff",
  brandMarkBg: "#18181b",
  brandMarkInk: "#ffffff"
};

const styles = {
  body: {
    margin: 0,
    backgroundColor: colors.background,
    color: colors.ink,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
  },
  container: {
    maxWidth: "480px",
    margin: "40px auto",
    padding: "32px",
    backgroundColor: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: "12px"
  },
  brand: {
    marginBottom: "24px"
  },
  brandMark: {
    display: "inline-block",
    width: "28px",
    height: "28px",
    margin: "0 10px 0 0",
    borderRadius: "8px",
    backgroundColor: colors.brandMarkBg,
    color: colors.brandMarkInk,
    fontSize: "13px",
    fontWeight: 600,
    lineHeight: "28px",
    textAlign: "center" as const
  },
  brandText: {
    display: "inline-block",
    margin: 0,
    color: colors.inkSoft,
    fontSize: "14px",
    fontWeight: 500,
    lineHeight: "28px",
    verticalAlign: "top"
  },
  heading: {
    margin: "0 0 8px",
    color: colors.ink,
    fontSize: "22px",
    fontWeight: 600,
    letterSpacing: "-0.01em",
    lineHeight: "1.25"
  },
  intro: {
    margin: "0 0 24px",
    color: colors.muted,
    fontSize: "15px",
    lineHeight: "1.55"
  },
  button: {
    display: "inline-block",
    padding: "10px 18px",
    borderRadius: "8px",
    backgroundColor: colors.accent,
    color: colors.accentInk,
    fontSize: "14px",
    fontWeight: 500,
    textDecoration: "none"
  },
  hr: {
    margin: "28px 0 20px",
    border: "none",
    borderTop: `1px solid ${colors.border}`
  },
  helpText: {
    margin: "0 0 6px",
    color: colors.soft,
    fontSize: "13px",
    lineHeight: "1.5"
  },
  link: {
    color: colors.inkSoft,
    fontSize: "13px",
    lineHeight: "1.5",
    wordBreak: "break-all" as const
  }
};
