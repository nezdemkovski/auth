import type { ComponentType, FormEvent, ReactNode } from "react";
import {
  SiFacebook,
  SiX
} from "@icons-pack/react-simple-icons";
import Github from "@lobehub/icons/es/Github";
import Google from "@lobehub/icons/es/Google";
import {
  Button,
  FormAlert,
  FormField as SharedFormField,
  InfoPanel as SharedInfoPanel,
  ThemeToggle as SharedThemeToggle
} from "@nezdemkovski/auth-ui";
import type { Theme } from "@nezdemkovski/auth-client-shared/theme";

import { getEyebrow, loginMethodLabel } from "./copy";
import type {
  AuthStep,
  SocialProviderConfig,
  SocialProviderId
} from "./types";

export function AuthHeading({
  step,
  isSignup,
  subtitle
}: {
  step: AuthStep;
  isSignup: boolean;
  subtitle: string;
}) {
  return (
    <div className="enter">
      <div className="mb-6 flex items-baseline gap-3">
        <span className="eyebrow shrink-0">{getEyebrow(step, isSignup)}</span>
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </div>

      <h1 className="serif text-[58px] leading-[0.95] tracking-[-0.03em] text-ink sm:text-[68px]">
        {step === "two-factor" ? (
          <>
            Verify <em>code.</em>
          </>
        ) : step === "two-factor-enroll" ? (
          <>
            Secure <em>account.</em>
          </>
        ) : step === "forgot-password" ? (
          <>
            Reset <em>password.</em>
          </>
        ) : step === "reset-sent" ? (
          <>
            Check <em>email.</em>
          </>
        ) : step === "passkey-enroll" ? (
          <>
            Add <em>passkey.</em>
          </>
        ) : isSignup ? (
          <>
            Create <em>account.</em>
          </>
        ) : (
          <>
            Welcome <em>back.</em>
          </>
        )}
      </h1>
      <p className="mt-3 text-[14.5px] leading-[1.5] text-muted">{subtitle}</p>
    </div>
  );
}

export function CredentialsStep({
  isSignup,
  passkeysEnabled,
  socialProviders,
  lastLoginMethod,
  pending,
  email,
  password,
  alternateUrl,
  onEmailChange,
  onPasswordChange,
  onPasskeySignIn,
  onSocialSignIn,
  onForgotPassword,
  onSubmit
}: {
  isSignup: boolean;
  passkeysEnabled: boolean;
  socialProviders: SocialProviderConfig[];
  lastLoginMethod: string | null;
  pending: boolean;
  email: string;
  password: string;
  alternateUrl: URL;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onPasskeySignIn: () => void;
  onSocialSignIn: (provider: SocialProviderId) => void;
  onForgotPassword: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const hasSocialProviders = socialProviders.length > 0;
  const showLastUsed = !isSignup && Boolean(lastLoginMethod);

  return (
    <>
      {showLastUsed ? (
        <div className="enter enter-1 mt-6 rounded-lg border border-border bg-surface-muted px-3 py-2 text-[12.5px] leading-5 text-muted">
          Last signed in with{" "}
          <span className="font-medium text-ink">
            {loginMethodLabel(lastLoginMethod)}
          </span>
          .
        </div>
      ) : null}

      {(passkeysEnabled && !isSignup) || hasSocialProviders ? (
        <div className={`enter enter-1 ${showLastUsed ? "mt-4" : "mt-8"} space-y-3`}>
          {passkeysEnabled && !isSignup ? (
            <ActionButton
              type="button"
              disabled={pending}
              onClick={onPasskeySignIn}
              badge={lastLoginMethod === "passkey" ? <LastUsedBadge contrast /> : undefined}
            >
              {pending ? "Waiting…" : "Sign in with passkey"}
            </ActionButton>
          ) : null}
          {hasSocialProviders ? (
            <div className="grid gap-2">
              {socialProviders.map((provider) => (
                <SocialButton
                  key={provider.id}
                  provider={provider}
                  disabled={pending}
                  lastUsed={lastLoginMethod === provider.id}
                  onClick={() => onSocialSignIn(provider.id)}
                />
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-3 text-muted-soft">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] uppercase tracking-[0.08em]">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </div>
      ) : null}

      <form
        onSubmit={onSubmit}
        className={`enter enter-1 ${
          (passkeysEnabled && !isSignup) || hasSocialProviders || showLastUsed
            ? "mt-4"
            : "mt-8"
        } space-y-4`}
      >
        <FormField
          id="email"
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={onEmailChange}
        />
        <FormField
          id="password"
          name="password"
          label="Password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          placeholder={isSignup ? "At least 12 characters" : "••••••••"}
          value={password}
          onChange={onPasswordChange}
          hint={
            !isSignup ? (
              <Button
                type="button"
                onClick={onForgotPassword}
                variant="link"
                size="sm"
                className="text-[12px]"
              >
                Forgot?
              </Button>
            ) : null
          }
        />

        <ActionButton
          type="submit"
          disabled={pending}
          badge={
            lastLoginMethod === "email" && !isSignup ? (
              <LastUsedBadge contrast />
            ) : undefined
          }
        >
          {pending ? "Working…" : isSignup ? "Create account ↗" : "Sign in ↗"}
        </ActionButton>
      </form>

      <div className="enter enter-2 mt-8">
        <hr className="rule" />
        <div className="mt-4 flex items-center justify-between gap-4 text-[13px]">
          <span className="text-muted">
            {isSignup ? "Already have an account?" : "No account yet?"}
          </span>
          <a
            href={alternateUrl.toString()}
            className="font-medium text-ink underline-offset-[3px] transition-colors hover:underline"
          >
            {isSignup ? "Sign in →" : "Create one →"}
          </a>
        </div>
      </div>
    </>
  );
}

const socialProviderMeta: Record<
  SocialProviderId,
  {
    label: string;
    icon: ComponentType<{ size?: number }>;
  }
> = {
  github: {
    label: "GitHub",
    icon: Github
  },
  google: {
    label: "Google",
    icon: Google
  },
  twitter: {
    label: "X",
    icon: SiX
  },
  facebook: {
    label: "Facebook",
    icon: SiFacebook
  }
};

function SocialButton({
  provider,
  disabled,
  lastUsed,
  onClick
}: {
  provider: SocialProviderConfig;
  disabled: boolean;
  lastUsed: boolean;
  onClick: () => void;
}) {
  const meta = socialProviderMeta[provider.id];
  const Icon = meta.icon;

  return (
    <Button
      type="button"
      disabled={disabled}
      onClick={onClick}
      fullWidth
      className="h-11"
      leading={<Icon size={16} />}
      badge={lastUsed ? <LastUsedBadge /> : null}
    >
      Continue with {provider.label}
    </Button>
  );
}

function LastUsedBadge({ contrast = false }: { contrast?: boolean }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.06em] ${
        contrast
          ? "border-[rgba(255,255,255,0.25)] bg-[rgba(255,255,255,0.18)] text-accent-ink"
          : "border-border bg-surface-muted text-muted"
      }`}
    >
      Last used
    </span>
  );
}

export function TwoFactorStep({
  pending,
  code,
  onCodeChange,
  onBack,
  onSubmit
}: {
  pending: boolean;
  code: string;
  onCodeChange: (value: string) => void;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="enter enter-1 mt-8 space-y-4">
      <FormField
        id="two-factor-code"
        name="code"
        label="Verification code"
        type="text"
        autoComplete="one-time-code"
        placeholder="123456"
        value={code}
        onChange={onCodeChange}
      />
      <ActionButton type="submit" disabled={pending}>
        {pending ? "Verifying…" : "Verify and continue ↗"}
      </ActionButton>
      <Button
        type="button"
        disabled={pending}
        onClick={onBack}
        variant="link"
        fullWidth
        className="text-[13px]"
      >
        Back to password sign-in
      </Button>
    </form>
  );
}

export function TwoFactorEnrollStep({
  pending,
  totpUri,
  backupCodes,
  code,
  onCodeChange,
  onStart,
  onSubmit
}: {
  pending: boolean;
  totpUri: string;
  backupCodes: string[];
  code: string;
  onCodeChange: (value: string) => void;
  onStart: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!totpUri) {
    return (
      <div className="enter enter-1 mt-8 space-y-3">
        <InfoPanel>
          This realm requires two-factor authentication. Set up an authenticator
          app to continue.
        </InfoPanel>
        <ActionButton type="button" disabled={pending} onClick={onStart}>
          {pending ? "Preparing…" : "Set up authenticator ↗"}
        </ActionButton>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="enter enter-1 mt-8 space-y-4">
      <div className="rounded-lg border border-border bg-surface-muted p-3">
        <p className="text-[12.5px] leading-5 text-muted">
          Add this setup key in your authenticator app, then enter the code it
          generates.
        </p>
        <textarea
          readOnly
          value={totpUri}
          rows={4}
          className="mt-3 w-full resize-none rounded-lg border border-border bg-surface p-2 font-mono text-[11px] leading-5 text-ink outline-none"
        />
      </div>

      {backupCodes.length > 0 ? (
        <div className="rounded-lg border border-border bg-surface-muted p-3">
          <p className="text-[12.5px] leading-5 text-muted">
            Save these backup codes before continuing.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-[11px] text-ink">
            {backupCodes.map((backupCode) => (
              <span key={backupCode}>{backupCode}</span>
            ))}
          </div>
        </div>
      ) : null}

      <FormField
        id="two-factor-enroll-code"
        name="code"
        label="Verification code"
        type="text"
        autoComplete="one-time-code"
        placeholder="123456"
        value={code}
        onChange={onCodeChange}
      />
      <ActionButton type="submit" disabled={pending}>
        {pending ? "Verifying…" : "Enable and continue ↗"}
      </ActionButton>
    </form>
  );
}

export function ForgotPasswordStep({
  pending,
  email,
  onEmailChange,
  onBack,
  onSubmit
}: {
  pending: boolean;
  email: string;
  onEmailChange: (value: string) => void;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="enter enter-1 mt-8 space-y-4">
      <FormField
        id="reset-email"
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={onEmailChange}
      />
      <ActionButton type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send reset link ↗"}
      </ActionButton>
      <Button
        type="button"
        disabled={pending}
        onClick={onBack}
        variant="link"
        fullWidth
        className="text-[13px]"
      >
        Back to sign in
      </Button>
    </form>
  );
}

export function PasskeyEnrollStep({
  pending,
  onAdd,
  onSkip
}: {
  pending: boolean;
  onAdd: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="enter enter-1 mt-8 space-y-3">
      <ActionButton type="button" disabled={pending} onClick={onAdd}>
        {pending ? "Waiting…" : "Add passkey"}
      </ActionButton>
      <Button
        type="button"
        disabled={pending}
        onClick={onSkip}
        variant="link"
        fullWidth
        className="text-[13px]"
      >
        Continue without passkey
      </Button>
    </div>
  );
}

export function RedirectingPanel() {
  return (
    <InfoPanel>Finishing sign-in…</InfoPanel>
  );
}

export function InfoPanel({ children }: { children: ReactNode }) {
  return <SharedInfoPanel>{children}</SharedInfoPanel>;
}

export function LoginFooter() {
  return (
    <footer className="enter enter-3 mono mt-12 text-center text-[10.5px] uppercase tracking-[0.08em] text-muted-soft sm:-mx-20 sm:whitespace-nowrap">
      ↳ Running on homelab ·{" "}
      <a
        href="https://github.com/nezdemkovski/auth"
        target="_blank"
        rel="noreferrer"
        className="underline-offset-[3px] transition-colors hover:text-ink hover:underline"
      >
        Open source on github ↗
      </a>
      {" · Built on "}
      <a
        href="https://better-auth.com"
        target="_blank"
        rel="noreferrer"
        className="underline-offset-[3px] transition-colors hover:text-ink hover:underline"
      >
        better-auth ↗
      </a>
    </footer>
  );
}

export function ErrorAlert({ children }: { children: ReactNode }) {
  return (
    <div className="enter enter-1 mt-6">
      <FormAlert>{children}</FormAlert>
    </div>
  );
}

export function ActionButton({
  type,
  disabled,
  badge,
  className,
  onClick,
  children
}: {
  type: "button" | "submit";
  disabled?: boolean;
  badge?: ReactNode;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type={type}
      variant="primary"
      size="md"
      fullWidth
      disabled={disabled}
      onClick={onClick}
      className={className ?? "mt-2 h-11"}
      badge={badge}
    >
      {children}
    </Button>
  );
}

export function FormField({
  id,
  name,
  label,
  type,
  autoComplete,
  placeholder,
  value,
  onChange,
  hint
}: {
  id: string;
  name: string;
  label: string;
  type: string;
  autoComplete: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
}) {
  return (
    <SharedFormField
      id={id}
      name={name}
      label={label}
      type={type}
      autoComplete={autoComplete}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      hint={hint}
    />
  );
}

export function ThemeToggle({
  theme,
  onToggle
}: {
  theme: Theme;
  onToggle: () => void;
}) {
  return <SharedThemeToggle theme={theme} onToggle={onToggle} />;
}
