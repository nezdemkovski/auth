import { AuthHeading } from "../components/AuthHeading";
import { CredentialsStep } from "../components/CredentialsStep";
import { LoginHeader } from "../components/LoginHeader";
import { LoginFooter } from "../components/LoginFooter";
import { PasskeyEnrollStep } from "../components/PasskeyEnrollStep";
import { RedirectingPanel } from "../components/RedirectingPanel";
import { ForgotPasswordStep } from "../components/RecoverySteps";
import { TwoFactorEnrollStep, TwoFactorStep } from "../components/TwoFactorSteps";
import { ErrorAlert, InfoPanel } from "../components/shared";
import { useLoginFlow } from "../hooks/useLoginFlow";
import type { LoginConfig } from "../types";

export function LoginPage({ config }: { config: LoginConfig }) {
  const { actions, state } = useLoginFlow(config);

  return (
    <div className="relative min-h-screen">
      <div
        aria-hidden="true"
        data-grid-bg
        className="pointer-events-none absolute inset-0"
      />

      <LoginHeader
        projectName={config.projectName}
        theme={state.theme}
        onToggleTheme={actions.toggleTheme}
      />

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
