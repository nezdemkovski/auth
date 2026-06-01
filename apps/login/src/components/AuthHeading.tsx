import { getEyebrow } from "../copy";
import type { AuthStep } from "../types";

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
