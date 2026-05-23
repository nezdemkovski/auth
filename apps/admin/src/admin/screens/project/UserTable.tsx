import type { ProjectUser } from "../../types";
import { Th } from "@nezdemkovski/auth-ui";
import { UserRow } from "./UserRow";

export function UserTable({
  users,
  emailServiceEnabled,
  resendPendingEmail,
  resendErrorEmail,
  resentVerificationEmail,
  terminatePendingUserId,
  terminateErrorUserId,
  terminatedSessionsUserId,
  onResendVerification,
  onTerminateSessions
}: {
  users: ProjectUser[];
  emailServiceEnabled: boolean;
  resendPendingEmail: string | null;
  resendErrorEmail: string | null;
  resentVerificationEmail: string | null;
  terminatePendingUserId: string | null;
  terminateErrorUserId: string | null;
  terminatedSessionsUserId: string | null;
  onResendVerification: (email: string) => void;
  onTerminateSessions: (userId: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border">
            <Th>User</Th>
            <Th>Role</Th>
            <Th>Status</Th>
            <Th align="right">Sessions</Th>
            <Th align="right">Joined</Th>
            <Th>{""}</Th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              emailServiceEnabled={emailServiceEnabled}
              resendPending={resendPendingEmail === user.email}
              resendError={resendErrorEmail === user.email}
              resentVerification={resentVerificationEmail === user.email}
              terminatePending={terminatePendingUserId === user.id}
              terminateError={terminateErrorUserId === user.id}
              terminatedSessions={terminatedSessionsUserId === user.id}
              onResendVerification={onResendVerification}
              onTerminateSessions={onTerminateSessions}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
