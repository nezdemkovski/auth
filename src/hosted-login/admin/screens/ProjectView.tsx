import type { useQuery } from "@tanstack/react-query";

import type { ProjectSettingsPatch, ProjectSummary, ProjectUsersResponse } from "../types";
import { pad2 } from "../utils/format";
import { Card, EmptyState, FormAlert, SysTag } from "../components/primitives";
import { StatCard } from "../components/Stats";
import { UsersSkeleton } from "../components/Skeletons";
import { ProjectSettingsForm } from "./project/ProjectSettingsForm";
import { UserTable } from "./project/UserTable";

export function ProjectView({
  project,
  usersQuery,
  emailServiceEnabled,
  resendPendingEmail,
  resendErrorEmail,
  resentVerificationEmail,
  terminatePendingUserId,
  terminateErrorUserId,
  terminatedSessionsUserId,
  updatePending,
  updateError,
  onResendVerification,
  onTerminateSessions,
  onUpdateProject
}: {
  project: ProjectSummary;
  usersQuery: ReturnType<typeof useQuery<ProjectUsersResponse>>;
  emailServiceEnabled: boolean;
  resendPendingEmail: string | null;
  resendErrorEmail: string | null;
  resentVerificationEmail: string | null;
  terminatePendingUserId: string | null;
  terminateErrorUserId: string | null;
  terminatedSessionsUserId: string | null;
  updatePending: boolean;
  updateError: string | null;
  onResendVerification: (email: string) => void;
  onTerminateSessions: (userId: string) => void;
  onUpdateProject: (patch: ProjectSettingsPatch) => void;
}) {
  const users = usersQuery.data?.users ?? [];

  return (
    <div className="space-y-10">
      <div>
        <div className="mb-3 flex items-baseline gap-3">
          <span className="eyebrow">00 — Realm</span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
          <code className="font-mono text-[11.5px] uppercase tracking-[0.06em] text-muted">
            {project.schema}
          </code>
        </div>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <h1 className="serif text-[56px] leading-[0.95] tracking-[-0.03em] text-ink sm:text-[64px]">
            {project.name}
            <em>.</em>
          </h1>
          {project.system ? <SysTag size="lg" /> : null}
        </div>
        {project.description ? (
          <p className="mt-3 max-w-[42rem] text-[14px] leading-[1.55] text-muted">
            {project.description}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          index={1}
          label="Users"
          value={project.userCount}
          hint="total accounts"
        />
        <StatCard
          index={2}
          label="Active sessions"
          value={project.activeSessionCount}
          hint="signed in right now"
        />
        <StatCard
          index={3}
          label="Verified"
          value={users.filter((user) => user.emailVerified).length}
          hint={users.length === 0 ? "no users yet" : `of ${users.length} loaded`}
        />
      </div>

      <section>
        <div className="mb-4 flex items-baseline gap-3">
          <span className="eyebrow">01 — Settings</span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
        </div>

        <Card>
          <ProjectSettingsForm
            project={project}
            pending={updatePending}
            error={updateError}
            onSubmit={onUpdateProject}
          />
        </Card>
      </section>

      <section>
        <div className="mb-4 flex items-baseline gap-3">
          <span className="eyebrow">02 — Users</span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
          {!usersQuery.isLoading && users.length > 0 ? (
            <span className="eyebrow text-muted-soft tabular">
              {pad2(users.length)} total
            </span>
          ) : null}
        </div>

        <Card padding={false}>
          {usersQuery.isLoading ? (
            <UsersSkeleton />
          ) : usersQuery.isError ? (
            <div className="p-6">
              <FormAlert>Could not load users.</FormAlert>
            </div>
          ) : users.length === 0 ? (
            <EmptyState
              title="No users yet"
              description="Users will appear here once someone signs up to this realm."
            />
          ) : (
            <UserTable
              users={users}
              emailServiceEnabled={emailServiceEnabled}
              resendPendingEmail={resendPendingEmail}
              resendErrorEmail={resendErrorEmail}
              resentVerificationEmail={resentVerificationEmail}
              terminatePendingUserId={terminatePendingUserId}
              terminateErrorUserId={terminateErrorUserId}
              terminatedSessionsUserId={terminatedSessionsUserId}
              onResendVerification={onResendVerification}
              onTerminateSessions={onTerminateSessions}
            />
          )}
        </Card>
      </section>
    </div>
  );
}
