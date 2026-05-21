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
  background: "#f4f7f5",
  panel: "#ffffff",
  ink: "#0b1110",
  muted: "#4b5b53",
  soft: "#6b7a72",
  border: "#dbe4df",
  accent: "#22c55e",
  accentInk: "#052e16"
};

const styles = {
  body: {
    margin: 0,
    backgroundColor: colors.background,
    color: colors.ink,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
  },
  container: {
    maxWidth: "520px",
    margin: "32px auto",
    padding: "32px",
    backgroundColor: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: "18px"
  },
  brand: {
    marginBottom: "28px"
  },
  brandMark: {
    display: "inline-block",
    width: "32px",
    height: "32px",
    margin: "0 10px 0 0",
    borderRadius: "12px",
    backgroundColor: "#dcfce7",
    color: "#166534",
    fontSize: "14px",
    fontWeight: 700,
    lineHeight: "32px",
    textAlign: "center" as const
  },
  brandText: {
    display: "inline-block",
    margin: 0,
    color: colors.soft,
    fontSize: "14px",
    fontWeight: 600,
    lineHeight: "32px",
    verticalAlign: "top"
  },
  heading: {
    margin: "0 0 12px",
    color: colors.ink,
    fontSize: "24px",
    lineHeight: "1.2"
  },
  intro: {
    margin: "0 0 24px",
    color: colors.muted,
    fontSize: "16px",
    lineHeight: "1.6"
  },
  button: {
    display: "inline-block",
    padding: "13px 18px",
    borderRadius: "12px",
    backgroundColor: colors.accent,
    color: colors.accentInk,
    fontSize: "15px",
    fontWeight: 700,
    textDecoration: "none"
  },
  hr: {
    margin: "28px 0 20px",
    borderColor: colors.border
  },
  helpText: {
    margin: "0 0 6px",
    color: colors.soft,
    fontSize: "13px",
    lineHeight: "1.5"
  },
  link: {
    color: "#15803d",
    fontSize: "13px",
    lineHeight: "1.5",
    wordBreak: "break-all" as const
  }
};
