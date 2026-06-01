import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  applyTheme,
  resolveTheme,
  setTheme,
  watchSystemTheme,
  type Theme
} from "@nezdemkovski/auth-client-shared/theme";

import {
  createLoginAuthClient,
  createLoginSessionRedirect,
  getLoginNextAction,
  LoginNextAction,
  PkceChallengeMethod,
  requestLoginPasswordReset,
  signInWithEmail,
  signInWithSocial,
  signUpWithEmail,
  verifyTwoFactorCode
} from "../auth-client";
import { getSubtitle, getTitle } from "../copy";
import type { AuthStep, LoginConfig, SocialProviderId } from "../types";

export const useLoginFlow = (config: LoginConfig) => {
  const authClient = useMemo(
    () => createLoginAuthClient(config.project),
    [config.project]
  );
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme());
  const [step, setStep] = useState<AuthStep>("credentials");
  const [error, setError] = useState<string | null>(config.error ?? null);
  const [pending, setPending] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [verifiedPassword, setVerifiedPassword] = useState<string | null>(null);
  const [totpUri, setTotpUri] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [lastLoginMethod, setLastLoginMethod] = useState<string | null>(() =>
    authClient.getLastUsedLoginMethod()
  );
  const isSignup = config.mode === "signup";
  const passkeysEnabled = config.features.passkey.enabled;
  const socialProviders = config.socialProviders;
  const title = getTitle(step, isSignup);
  const subtitle = getSubtitle(step, isSignup, config.projectName);
  const alternateUrl = useMemo(() => {
    const url = new URL(`/login/${config.project}`, window.location.origin);
    url.searchParams.set("redirect_uri", config.redirectUri);
    url.searchParams.set("state", config.state);
    url.searchParams.set("mode", isSignup ? "login" : "signup");
    url.searchParams.set("code_challenge", config.codeChallenge);
    url.searchParams.set("code_challenge_method", PkceChallengeMethod.S256);
    return url;
  }, [config, isSignup]);

  useEffect(() => {
    document.title = `${title} · ${config.projectName}`;
    applyTheme(theme);
  }, [theme, title, config.projectName]);

  useEffect(() => {
    return watchSystemTheme((next) => setThemeState(next));
  }, []);

  useEffect(() => {
    setLastLoginMethod(authClient.getLastUsedLoginMethod());
  }, [authClient, step]);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  };

  const redirectWithCurrentSession = async () => {
    setStep("redirecting");
    const redirectTo = await createLoginSessionRedirect({
      project: config.project,
      redirectUri: config.redirectUri,
      state: config.state,
      codeChallenge: config.codeChallenge
    });

    if (!redirectTo) {
      setStep("credentials");
      setError("Could not finish sign-in");
      return;
    }

    window.location.assign(redirectTo);
  };

  const continueAfterAuth = async ({
    offerPasskey,
    password: authenticatedPassword
  }: {
    offerPasskey: boolean;
    password: string | null;
  }) => {
    const nextAction = await getLoginNextAction(config.project);

    if (nextAction === LoginNextAction.EnrollTwoFactor) {
      setVerifiedPassword(authenticatedPassword);
      setStep("two-factor-enroll");
      return;
    }

    if (offerPasskey && nextAction === LoginNextAction.OfferPasskey) {
      setStep("passkey-enroll");
      return;
    }

    await redirectWithCurrentSession();
  };

  const submitCredentials = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      if (isSignup) {
        const created = await signUpWithEmail({
          project: config.project,
          email,
          password,
          callbackURL: new URL(config.redirectUri).origin
        });
        if (!created) {
          setError("Could not create account");
          return;
        }
        setVerifiedPassword(password);
      } else {
        const signedIn = await signInWithEmail({
          project: config.project,
          email,
          password
        });
        if (!signedIn.ok) {
          setError("Invalid email or password");
          return;
        }
        if (signedIn.twoFactorRedirect) {
          setStep("two-factor");
          return;
        }
        setVerifiedPassword(password);
      }

      await continueAfterAuth({ offerPasskey: passkeysEnabled, password });
    } finally {
      setPending(false);
    }
  };

  const signInWithPasskey = async () => {
    setPending(true);
    setError(null);

    try {
      const result = await authClient.signIn.passkey();
      if (result.error) {
        setError(result.error.message || "Could not sign in with passkey");
        return;
      }

      await continueAfterAuth({ offerPasskey: false, password: null });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in with passkey");
    } finally {
      setPending(false);
    }
  };

  const startSocialSignIn = async (provider: SocialProviderId) => {
    setPending(true);
    setError(null);

    const callbackURL = new URL(`/login/${config.project}`, window.location.origin);
    callbackURL.searchParams.set("redirect_uri", config.redirectUri);
    callbackURL.searchParams.set("state", config.state);
    callbackURL.searchParams.set("mode", config.mode);
    callbackURL.searchParams.set("code_challenge", config.codeChallenge);
    callbackURL.searchParams.set("code_challenge_method", PkceChallengeMethod.S256);
    callbackURL.searchParams.set("social", "1");

    try {
      const started = await signInWithSocial({
        project: config.project,
        provider,
        callbackURL: callbackURL.toString()
      });
      if (!started) {
        setPending(false);
        setError("Could not start social sign-in");
      }
    } catch (cause) {
      setPending(false);
      setError(cause instanceof Error ? cause.message : "Could not start social sign-in");
    }
  };

  const submitTwoFactor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const verified = await verifyTwoFactorCode({
        project: config.project,
        code: twoFactorCode.trim()
      });

      if (!verified) {
        setError("Invalid verification code");
        return;
      }

      await continueAfterAuth({ offerPasskey: passkeysEnabled, password });
    } finally {
      setPending(false);
    }
  };

  const submitForgotPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const resetUrl = new URL(
        `/login/${config.project}/reset-password`,
        window.location.origin
      );
      const sent = await requestLoginPasswordReset({
        project: config.project,
        email,
        redirectTo: resetUrl.toString()
      });
      if (!sent) {
        setError("Could not send reset email");
        return;
      }

      setStep("reset-sent");
    } finally {
      setPending(false);
    }
  };

  const addPasskey = async () => {
    setPending(true);
    setError(null);

    try {
      const result = await authClient.passkey.addPasskey({
        name: `${config.projectName} passkey`
      });
      if (result.error) {
        setError(result.error.message || "Could not add passkey");
        return;
      }

      await redirectWithCurrentSession();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add passkey");
    } finally {
      setPending(false);
    }
  };

  const startTwoFactorEnrollment = async () => {
    setPending(true);
    setError(null);

    try {
      const result = await authClient.twoFactor.enable({
        ...(verifiedPassword ? { password: verifiedPassword } : {}),
        issuer: config.projectName
      });
      if (result.error || !result.data?.totpURI) {
        setError(result.error?.message || "Could not start two-factor setup");
        return;
      }

      setTotpUri(result.data.totpURI);
      setBackupCodes(result.data.backupCodes ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start two-factor setup");
    } finally {
      setPending(false);
    }
  };

  const verifyTwoFactorEnrollment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const result = await authClient.twoFactor.verifyTotp({
        code: twoFactorCode.trim(),
        trustDevice: true
      });
      if (result.error) {
        setError(result.error.message || "Invalid verification code");
        return;
      }

      await continueAfterAuth({ offerPasskey: passkeysEnabled, password: verifiedPassword });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid verification code");
    } finally {
      setPending(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("social") !== "1") {
      return;
    }

    void continueAfterAuth({ offerPasskey: passkeysEnabled, password: null });
  }, []);

  return {
    actions: {
      addPasskey,
      redirectWithCurrentSession,
      setEmail,
      setPassword,
      setStep,
      setTwoFactorCode,
      signInWithPasskey,
      startSocialSignIn,
      startTwoFactorEnrollment,
      submitCredentials,
      submitForgotPassword,
      submitTwoFactor,
      toggleTheme,
      verifyTwoFactorEnrollment
    },
    state: {
      alternateUrl,
      backupCodes,
      email,
      error,
      isSignup,
      lastLoginMethod,
      passkeysEnabled,
      password,
      pending,
      socialProviders,
      step,
      subtitle,
      theme,
      totpUri,
      twoFactorCode
    }
  };
};
