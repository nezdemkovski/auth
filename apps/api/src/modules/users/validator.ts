type ResendVerificationBody = {
  email?: unknown;
};

export const parseResendVerificationEmail = (body: ResendVerificationBody) => {
  return typeof body.email === "string" ? body.email : null;
};
