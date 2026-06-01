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
import { useLoginFlow } from "../hooks/useLoginFlow";
import type { LoginConfig } from "../types";

export function LoginPage({ config }: { config: LoginConfig }) {
  const { actions, state } = useLoginFlow(config);
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
        <ThemeToggle theme={state.theme} onToggle={actions.toggleTheme} />
      </header>

      <section className="relative z-10 grid min-h-[calc(100vh-3.5rem)] place-items-center px-5 py-8">
        <div className="w-full max-w-[440px]">
          <AuthHeading
            step={state.step}
            isSignup={state.isSignup}
            subtitle={state.subtitle}
          />
          {state.error ? <ErrorAlert>{state.error}</ErrorAlert> : null}

          {state.step === "credentials" ? (
            <CredentialsStep
              isSignup={state.isSignup}
              passkeysEnabled={state.passkeysEnabled}
              socialProviders={state.socialProviders}
              lastLoginMethod={state.lastLoginMethod}
              pending={state.pending}
              email={state.email}
              password={state.password}
              alternateUrl={state.alternateUrl}
              onEmailChange={actions.setEmail}
              onPasswordChange={actions.setPassword}
              onPasskeySignIn={() => void actions.signInWithPasskey()}
              onSocialSignIn={(provider) => void actions.startSocialSignIn(provider)}
              onForgotPassword={() => actions.setStep("forgot-password")}
              onSubmit={(event) => void actions.submitCredentials(event)}
            />
          ) : null}

          {state.step === "two-factor" ? (
            <TwoFactorStep
              pending={state.pending}
              code={state.twoFactorCode}
              onCodeChange={actions.setTwoFactorCode}
              onBack={() => actions.setStep("credentials")}
              onSubmit={(event) => void actions.submitTwoFactor(event)}
            />
          ) : null}

          {state.step === "two-factor-enroll" ? (
            <TwoFactorEnrollStep
              pending={state.pending}
              totpUri={state.totpUri}
              backupCodes={state.backupCodes}
              code={state.twoFactorCode}
              onCodeChange={actions.setTwoFactorCode}
              onStart={() => void actions.startTwoFactorEnrollment()}
              onSubmit={(event) => void actions.verifyTwoFactorEnrollment(event)}
            />
          ) : null}

          {state.step === "forgot-password" ? (
            <ForgotPasswordStep
              pending={state.pending}
              email={state.email}
              onEmailChange={actions.setEmail}
              onBack={() => actions.setStep("credentials")}
              onSubmit={(event) => void actions.submitForgotPassword(event)}
            />
          ) : null}

          {state.step === "reset-sent" ? (
            <InfoPanel>
              If an account exists for that email, a reset link has been sent.
            </InfoPanel>
          ) : null}

          {state.step === "passkey-enroll" ? (
            <PasskeyEnrollStep
              pending={state.pending}
              onAdd={() => void actions.addPasskey()}
              onSkip={() => void actions.redirectWithCurrentSession()}
            />
          ) : null}

          {state.step === "redirecting" ? <RedirectingPanel /> : null}
          <LoginFooter />
        </div>
      </section>
    </div>
  );
}
