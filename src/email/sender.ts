export const EmailProvider = {
  None: "none",
  Cloudflare: "cloudflare",
  Resend: "resend"
} as const;

export type EmailProvider = (typeof EmailProvider)[keyof typeof EmailProvider];

export type EmailConfig =
  | {
      provider: typeof EmailProvider.None;
    }
  | {
      provider: typeof EmailProvider.Cloudflare;
      accountId: string;
      apiToken: string;
      from: string;
    }
  | {
      provider: typeof EmailProvider.Resend;
      apiKey: string;
      from: string;
    };

export type EmailSender = {
  send(input: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void>;
};

export function createEmailSender(config: EmailConfig): EmailSender | null {
  if (config.provider === EmailProvider.None) {
    return null;
  }

  if (config.provider === EmailProvider.Cloudflare) {
    return new CloudflareEmailSender(config);
  }

  return new ResendEmailSender(config);
}

class CloudflareEmailSender implements EmailSender {
  constructor(private readonly config: Extract<EmailConfig, { provider: "cloudflare" }>) {}

  async send(input: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/email/sending/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: this.config.from,
          to: input.to,
          subject: input.subject,
          html: input.html,
          text: input.text
        })
      }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Cloudflare Email send failed: ${response.status} ${body}`);
    }
  }
}

class ResendEmailSender implements EmailSender {
  constructor(private readonly config: Extract<EmailConfig, { provider: "resend" }>) {}

  async send(input: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: this.config.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Resend email send failed: ${response.status} ${body}`);
    }
  }
}
