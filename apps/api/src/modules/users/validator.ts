type ResendVerificationBody = {
  email?: unknown;
};

export function parseResendVerificationEmail(body: ResendVerificationBody): string | null {
  return typeof body.email === "string" ? body.email : null;
}
