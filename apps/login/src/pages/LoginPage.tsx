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
import {
  AuthHeading,
  CredentialsStep,
  ErrorAlert,
  ForgotPasswordStep,
  InfoPanel,
  LoginFooter,
  PasskeyEnrollStep,
  RedirectingPanel,
  ThemeToggle,
  TwoFactorEnrollStep,
  TwoFactorStep
} from "../components";
import { getSubtitle, getTitle } from "../copy";
import type { AuthStep, LoginConfig, SocialProviderId } from "../types";

export function LoginPage({ config }: { config: LoginConfig }) {
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
  }, [step]);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  }

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
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
  }

  async function signInWithPasskey() {
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
  }

  async function startSocialSignIn(provider: SocialProviderId) {
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
  }

  async function submitTwoFactor(event: FormEvent<HTMLFormElement>) {
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
  }

  async function submitForgotPassword(event: FormEvent<HTMLFormElement>) {
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
  }

  async function addPasskey() {
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
  }

  async function startTwoFactorEnrollment() {
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
  }

  async function verifyTwoFactorEnrollment(event: FormEvent<HTMLFormElement>) {
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
  }

  async function continueAfterAuth({
    offerPasskey,
    password
  }: {
    offerPasskey: boolean;
    password: string | null;
  }) {
    const nextAction = await getLoginNextAction(config.project);

    if (nextAction === LoginNextAction.EnrollTwoFactor) {
      setVerifiedPassword(password);
      setStep("two-factor-enroll");
      return;
    }

    if (offerPasskey && nextAction === LoginNextAction.OfferPasskey) {
      setStep("passkey-enroll");
      return;
    }

    await redirectWithCurrentSession();
  }

  async function redirectWithCurrentSession() {
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
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("social") !== "1") {
      return;
    }

    void continueAfterAuth({ offerPasskey: passkeysEnabled, password: null });
  }, []);

  const projectInitial = config.projectName.trim().charAt(0).toUpperCase() || "·";

  return (
    <div className="relative min-h-screen">
      <div
        aria-hidden="true"
        data-grid-bg
        className="pointer-events-none absolute inset-0"
      />

      <header className="relative z-10 flex h-14 items-center justify-between px-6 lg:px-10">
        <div className="flex items-center gap-2 text-ink">
          <span
            aria-hidden="true"
            className="grid h-7 w-7 place-items-center rounded-md bg-accent text-[13px] font-semibold tracking-[-0.02em] text-accent-ink"
            style={{ boxShadow: "var(--shadow-button)" }}
          >
            {projectInitial}
          </span>
          <span className="text-[13.5px] font-medium tracking-[-0.005em]">
            {config.projectName}
          </span>
        </div>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </header>

      <section className="relative z-10 grid min-h-[calc(100vh-3.5rem)] place-items-center px-5 py-8">
        <div className="w-full max-w-[440px]">
          <AuthHeading step={step} isSignup={isSignup} subtitle={subtitle} />
          {error ? <ErrorAlert>{error}</ErrorAlert> : null}

          {step === "credentials" ? (
            <CredentialsStep
              isSignup={isSignup}
              passkeysEnabled={passkeysEnabled}
              socialProviders={socialProviders}
              lastLoginMethod={lastLoginMethod}
              pending={pending}
              email={email}
              password={password}
              alternateUrl={alternateUrl}
              onEmailChange={setEmail}
              onPasswordChange={setPassword}
              onPasskeySignIn={() => void signInWithPasskey()}
              onSocialSignIn={(provider) => void startSocialSignIn(provider)}
              onForgotPassword={() => setStep("forgot-password")}
              onSubmit={(event) => void submitCredentials(event)}
            />
          ) : null}

          {step === "two-factor" ? (
            <TwoFactorStep
              pending={pending}
              code={twoFactorCode}
              onCodeChange={setTwoFactorCode}
              onBack={() => setStep("credentials")}
              onSubmit={(event) => void submitTwoFactor(event)}
            />
          ) : null}

          {step === "two-factor-enroll" ? (
            <TwoFactorEnrollStep
              pending={pending}
              totpUri={totpUri}
              backupCodes={backupCodes}
              code={twoFactorCode}
              onCodeChange={setTwoFactorCode}
              onStart={() => void startTwoFactorEnrollment()}
              onSubmit={(event) => void verifyTwoFactorEnrollment(event)}
            />
          ) : null}

          {step === "forgot-password" ? (
            <ForgotPasswordStep
              pending={pending}
              email={email}
              onEmailChange={setEmail}
              onBack={() => setStep("credentials")}
              onSubmit={(event) => void submitForgotPassword(event)}
            />
          ) : null}

          {step === "reset-sent" ? (
            <InfoPanel>
              If an account exists for that email, a reset link has been sent.
            </InfoPanel>
          ) : null}

          {step === "passkey-enroll" ? (
            <PasskeyEnrollStep
              pending={pending}
              onAdd={() => void addPasskey()}
              onSkip={() => void redirectWithCurrentSession()}
            />
          ) : null}

          {step === "redirecting" ? <RedirectingPanel /> : null}
          <LoginFooter />
        </div>
      </section>
    </div>
  );
}
