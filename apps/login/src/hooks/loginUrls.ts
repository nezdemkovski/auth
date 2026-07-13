import type { LoginConfig } from "../types";

export const loginAlternateUrl = (config: LoginConfig, isSignup: boolean) => {
  const url = new URL(`/login/${config.project}`, window.location.origin);
  url.search = window.location.search;
  url.searchParams.set("mode", isSignup ? "login" : "signup");
  return url;
};

export const passwordResetUrl = (config: LoginConfig) => {
  return new URL(`/login/${config.project}/reset-password`, window.location.origin);
};
