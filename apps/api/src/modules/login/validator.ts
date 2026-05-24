export type LoginSessionCodeInput = {
  redirectUri: string;
  state: string;
  codeChallenge: string;
};

export type LoginCodeExchangeInput = {
  code: string;
  redirectUri: string;
  codeVerifier: string;
};

export function parseLoginSessionCodeInput(body: unknown): LoginSessionCodeInput {
  return {
    redirectUri: getStringField(body, "redirect_uri"),
    state: getStringField(body, "state"),
    codeChallenge: getStringField(body, "code_challenge")
  };
}

export function parseLoginCodeExchangeInput(body: unknown): LoginCodeExchangeInput {
  return {
    code: getStringField(body, "code"),
    redirectUri: getStringField(body, "redirect_uri"),
    codeVerifier: getStringField(body, "code_verifier")
  };
}

function getStringField(body: unknown, field: string): string {
  if (!isRecord(body)) {
    return "";
  }

  const value = body[field];
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
