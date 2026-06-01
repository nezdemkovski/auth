import { Mail } from "lucide-react";
import type { ProjectUser } from "../../types";
import { formatDate } from "../../utils/format";
import { Avatar, Button, Pill, StatusBadge, Td } from "@nezdemkovski/auth-ui";

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
            <Button
              size="sm"
              disabled={!emailServiceEnabled || resendPending}
              onClick={() => onResendVerification(user.email)}
              className="h-7 px-2 text-[12px]"
              leading={<Mail size={12} strokeWidth={1.8} />}
              title={
                !emailServiceEnabled
                  ? "Email service is disabled"
                  : "Resend verification email"
              }
            >
              {resendPending ? "Sending…" : "Resend"}
            </Button>
          ) : null}
          {user.sessionCount > 0 ? (
            <Button
              size="sm"
              disabled={terminatePending}
              onClick={() => onTerminateSessions(user.id)}
              className="h-7 px-2 text-[12px]"
              title="Terminate all active sessions for this user"
            >
              {terminatePending ? "Terminating…" : "Terminate sessions"}
            </Button>
          ) : null}
          {resendError || terminateError ? (
            <span className="text-[11px] text-danger">
              Failed
            </span>
          ) : null}
          {resentVerification || terminatedSessions ? (
            <span className="text-[11px] text-success">
              {terminatedSessions ? "Terminated" : "Sent"}
            </span>
          ) : null}
        </div>
      </Td>
    </tr>
  );
}
