import { PkceChallengeMethod } from "../auth-client";
import type { LoginConfig } from "../types";

export const loginAlternateUrl = (config: LoginConfig, isSignup: boolean) => {
  const url = new URL(`/login/${config.project}`, window.location.origin);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", config.state);
  url.searchParams.set("mode", isSignup ? "login" : "signup");
  url.searchParams.set("code_challenge", config.codeChallenge);
  url.searchParams.set("code_challenge_method", PkceChallengeMethod.S256);
  return url;
};

export const socialCallbackUrl = (config: LoginConfig) => {
  const url = new URL(`/login/${config.project}`, window.location.origin);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", config.state);
  url.searchParams.set("mode", config.mode);
  url.searchParams.set("code_challenge", config.codeChallenge);
  url.searchParams.set("code_challenge_method", PkceChallengeMethod.S256);
  url.searchParams.set("social", "1");
  return url;
};

export const passwordResetUrl = (config: LoginConfig) => {
  return new URL(`/login/${config.project}/reset-password`, window.location.origin);
};
