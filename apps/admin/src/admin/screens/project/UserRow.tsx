import { Mail } from "lucide-react";
import type { ProjectUser } from "../../types";
import { formatDate } from "../../utils/format";
import { Avatar, Pill, StatusBadge } from "@nezdemkovski/auth-ui";
import { Td } from "@nezdemkovski/auth-ui";

export function UserRow({
  user,
  emailServiceEnabled,
  resendPending,
  resendError,
  resentVerification,
  terminatePending,
  terminateError,
  terminatedSessions,
  onResendVerification,
  onTerminateSessions
}: {
  user: ProjectUser;
  emailServiceEnabled: boolean;
  resendPending: boolean;
  resendError: boolean;
  resentVerification: boolean;
  terminatePending: boolean;
  terminateError: boolean;
  terminatedSessions: boolean;
  onResendVerification: (email: string) => void;
  onTerminateSessions: (userId: string) => void;
}) {
  return (
    <tr className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-hover">
      <Td>
        <div className="flex items-center gap-3">
          <Avatar email={user.email} size={32} />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-ink">
              {user.name || user.email.split("@")[0]}
            </div>
            <div className="truncate text-[12px] text-muted">{user.email}</div>
          </div>
        </div>
      </Td>
      <Td>
        <Pill>{user.role ?? "user"}</Pill>
      </Td>
      <Td>
        {user.banned ? (
          <StatusBadge tone="danger" label="Banned" />
        ) : user.emailVerified ? (
          <StatusBadge tone="success" label="Verified" />
        ) : (
          <StatusBadge tone="warning" label="Unverified" />
        )}
      </Td>
      <Td align="right">
        <span className="tabular text-[13px] text-ink-soft">
          {user.sessionCount}
        </span>
      </Td>
      <Td align="right">
        <span className="text-[12.5px] text-muted">
          {formatDate(user.createdAt)}
        </span>
      </Td>
      <Td align="right">
        <div className="flex flex-col items-end gap-1">
          {!user.emailVerified && !user.banned ? (
            <button
              type="button"
              data-press
              disabled={!emailServiceEnabled || resendPending}
              onClick={() => onResendVerification(user.email)}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface px-2 text-[12px] font-medium text-ink-soft outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
              title={
                !emailServiceEnabled
                  ? "Email service is disabled"
                  : "Resend verification email"
              }
            >
              <Mail size={12} strokeWidth={1.8} />
              {resendPending ? "Sending…" : "Resend"}
            </button>
          ) : null}
          {user.sessionCount > 0 ? (
            <button
              type="button"
              data-press
              disabled={terminatePending}
              onClick={() => onTerminateSessions(user.id)}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface px-2 text-[12px] font-medium text-ink-soft outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
              title="Terminate all active sessions for this user"
            >
              {terminatePending ? "Terminating…" : "Terminate sessions"}
            </button>
          ) : null}
          {resendError || terminateError ? (
            <span className="text-[11px]" style={{ color: "var(--danger)" }}>
              Failed
            </span>
          ) : null}
          {resentVerification || terminatedSessions ? (
            <span className="text-[11px]" style={{ color: "var(--success)" }}>
              {terminatedSessions ? "Terminated" : "Sent"}
            </span>
          ) : null}
        </div>
      </Td>
    </tr>
  );
}
