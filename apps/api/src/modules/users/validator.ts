type ResendVerificationBody = {
  email?: unknown;
};

const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const parseResendVerificationEmail = (body: ResendVerificationBody) => {
  if (typeof body.email !== "string") {
    return null;
  }

  const email = body.email.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) {
    return null;
  }

  return EMAIL_PATTERN.test(email) ? email : null;
};
