import type { ComponentType, FormEvent } from "react";
import { SiFacebook, SiTelegram, SiX } from "@icons-pack/react-simple-icons";
import Github from "@lobehub/icons/es/Github";
import Google from "@lobehub/icons/es/Google";

import { Button } from "@nezdemkovski/auth-ui";

import { loginMethodLabel } from "../copy";
import type { SocialProviderConfig, SocialProviderId } from "../types";
import { ActionButton, FormField } from "./shared";

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
  telegram: {
    label: "Telegram",
    icon: SiTelegram
  },
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
