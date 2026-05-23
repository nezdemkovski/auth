import {
  Button as AriaButton,
  Text,
  UNSTABLE_Toast as Toast,
  UNSTABLE_ToastContent as ToastContent,
  UNSTABLE_ToastQueue as ToastQueue,
  UNSTABLE_ToastRegion as ToastRegion
} from "react-aria-components";

import { CheckIcon } from "@nezdemkovski/auth-client-shared/icons";

export type ToastTone = "success" | "info" | "danger";

export type ToastPayload = {
  title: string;
  description?: string;
  tone?: ToastTone;
};

export const toastQueue = new ToastQueue<ToastPayload>({
  maxVisibleToasts: 5
});

export function notify(payload: ToastPayload, options?: { timeout?: number }): void {
  toastQueue.add(payload, { timeout: options?.timeout ?? 4500 });
}

export function notifyError(title: string, description?: string): void {
  notify({ title, description, tone: "danger" }, { timeout: 6000 });
}

export function notifySuccess(title: string, description?: string): void {
  notify({ title, description, tone: "success" });
}

export function Toaster() {
  return (
    <ToastRegion
      queue={toastQueue}
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[320px] flex-col-reverse gap-2 outline-none"
    >
      {({ toast }) => {
        const tone = toast.content.tone ?? "info";
        const palette = TONES[tone];
        return (
          <Toast
            toast={toast}
            className={`pointer-events-auto group relative flex w-full items-start gap-3 overflow-hidden rounded-xl border bg-surface px-3.5 py-3 outline-none data-[entering]:animate-[toast-in_220ms_cubic-bezier(0.22,1,0.36,1)] data-[exiting]:animate-[toast-out_180ms_cubic-bezier(0.4,0,1,1)] ${palette.border}`}
            style={{ boxShadow: "var(--shadow-elevated)" }}
          >
            <span
              aria-hidden="true"
              className={`mt-[3px] grid h-5 w-5 shrink-0 place-items-center rounded-full ${palette.iconBg}`}
            >
              {tone === "success" ? (
                <CheckIcon size={12} className={palette.iconColor} />
              ) : (
                <span className={`h-1.5 w-1.5 rounded-full ${palette.dot}`} />
              )}
            </span>
            <ToastContent className="flex min-w-0 flex-1 flex-col gap-0.5">
              <Text
                slot="title"
                className="text-[13px] font-medium leading-5 text-ink"
              >
                {toast.content.title}
              </Text>
              {toast.content.description ? (
                <Text
                  slot="description"
                  className="text-[12.5px] leading-[1.45] text-muted"
                >
                  {toast.content.description}
                </Text>
              ) : null}
            </ToastContent>
            <AriaButton
              slot="close"
              aria-label="Dismiss"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-soft outline-none transition-colors hover:bg-surface-hover hover:text-ink data-[focused]:bg-surface-hover data-[focused]:text-ink"
            >
              <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </AriaButton>
          </Toast>
        );
      }}
    </ToastRegion>
  );
}

const TONES: Record<
  ToastTone,
  { border: string; iconBg: string; iconColor: string; dot: string }
> = {
  success: {
    border: "border-[var(--success-border)]",
    iconBg: "bg-[var(--success-bg)]",
    iconColor: "text-[var(--success)]",
    dot: "bg-[var(--success)]"
  },
  info: {
    border: "border-border",
    iconBg: "bg-surface-muted",
    iconColor: "text-ink-soft",
    dot: "bg-muted"
  },
  danger: {
    border: "border-[var(--danger-border)]",
    iconBg: "bg-[var(--danger-bg)]",
    iconColor: "text-[var(--danger)]",
    dot: "bg-[var(--danger)]"
  }
};
