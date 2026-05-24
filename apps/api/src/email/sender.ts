export enum EmailProvider {
  None = "none",
  Cloudflare = "cloudflare",
  Resend = "resend"
}

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

export const createEmailSender = (config: EmailConfig) => {
  if (config.provider === EmailProvider.None) {
    return null;
  }

  if (config.provider === EmailProvider.Cloudflare) {
    return new CloudflareEmailSender(config);
  }

  return new ResendEmailSender(config);
};

class CloudflareEmailSender implements EmailSender {
  constructor(
    private readonly config: Extract<EmailConfig, { provider: EmailProvider.Cloudflare }>
  ) {}

  async send(input: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }) {
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
  constructor(
    private readonly config: Extract<EmailConfig, { provider: EmailProvider.Resend }>
  ) {}

  async send(input: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }) {
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
