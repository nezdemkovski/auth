import type { AuthStep, ScopeDescription, SocialProviderId } from "./types";

export const SOCIAL_PROVIDER_LABELS: Record<SocialProviderId, string> = {
  telegram: "Telegram",
  github: "GitHub",
  google: "Google",
  twitter: "X",
  facebook: "Facebook"
};

export const getTitle = (step: AuthStep, isSignup: boolean) => {
  if (step === "two-factor") return "Verify code";
  if (step === "two-factor-enroll") return "Set up two-factor";
  if (step === "forgot-password") return "Reset password";
  if (step === "reset-sent") return "Check your email";
  if (step === "passkey-enroll") return "Add passkey";
  return isSignup ? "Create account" : "Welcome back";
};

export const getSubtitle = (
  step: AuthStep,
  isSignup: boolean,
  projectName: string
) => {
  if (step === "two-factor") {
    return "Enter your authenticator code to finish signing in.";
  }
  if (step === "two-factor-enroll") {
    return "Set up an authenticator app before continuing.";
  }
  if (step === "forgot-password") {
    return "Send a password reset link to your email.";
  }
  if (step === "reset-sent") {
    return "Check your inbox for the next step.";
  }
  if (step === "passkey-enroll") {
    return "Save a passkey for faster sign-ins on this device.";
  }
  return isSignup ? `Set up access to ${projectName}.` : `Continue to ${projectName}.`;
};

export const getEyebrow = (step: AuthStep, isSignup: boolean) => {
  if (step === "two-factor") return "Security";
  if (step === "two-factor-enroll") return "Security";
  if (step === "forgot-password" || step === "reset-sent") return "Reset";
  if (step === "passkey-enroll") return "Passkey";
  return isSignup ? "Register" : "Sign in";
};

export const loginMethodLabel = (method: string | null) => {
  if (!method) return "your previous method";
  if (method === "email") return "email and password";
  if (method === "passkey") return "passkey";
  if (
    method === "telegram" ||
    method === "github" ||
    method === "google" ||
    method === "twitter" ||
    method === "facebook"
  ) {
    return SOCIAL_PROVIDER_LABELS[method];
  }

  return method;
};

export const fallbackScopeDescription = (scope: string): ScopeDescription => ({
  title: scope,
  description: "Access this application-specific permission."
});
