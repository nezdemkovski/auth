import type { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import type {
  AuthConnectionCredential,
  AuthConnectionsResponse,
  BillingSettings,
  BillingSettingsPatch,
  BillingProductMapping,
  CreateAuthConnectionInput,
  CreatePolarProductInput,
  ProjectSettingsPatch,
  ProjectSummary,
  ProjectUsersResponse,
  SocialProviderId,
  SocialProviderPatch,
  SocialProvidersResponse,
  StorageSettings,
  PolarProductsResponse,
  StorageSettingsPatch,
  StorageObject
} from "../types";
import { pad2 } from "../utils/format";
import { Card, EmptyState, FormAlert, SysTag } from "@nezdemkovski/auth-ui";
import { StatCard } from "@nezdemkovski/auth-ui";
import { UsersSkeleton } from "@nezdemkovski/auth-ui";
import { ProjectSettingsForm } from "./project/ProjectSettingsForm";
import { BillingSettings as BillingSettingsForm } from "./project/BillingSettings";
import { AuthConnectionSettings } from "./project/auth-connections/AuthConnectionSettings";
import { SocialProviderSettings } from "./project/SocialProviderSettings";
import { StorageSettingsForm } from "./project/StorageSettings";
import { UserTable } from "./project/UserTable";

export function ProjectView({
  project,
  usersQuery,
  socialProvidersQuery,
  authConnectionsQuery,
  billingQuery,
  storageQuery,
  polarProductsQuery,
  emailServiceEnabled,
  resendPendingEmail,
  resendErrorEmail,
  resentVerificationEmail,
  terminatePendingUserId,
  terminateErrorUserId,
  terminatedSessionsUserId,
  updatePending,
  updateError,
  socialProviderPending,
  socialProviderVerifyPending,
  socialProviderError,
  billingPending,
  billingVerifyPending,
  billingError,
  storagePending,
  storageUploadPending,
  storageError,
  storageUploadError,
  uploadedIcon,
  polarProductCreatePending,
  polarProductCreateError,
  onResendVerification,
  onTerminateSessions,
  onUpdateProject,
  onUpdateSocialProvider,
  onVerifySocialProvider,
  onCreateAuthConnection,
  onSetAuthConnectionDisabled,
  onRotateAuthConnectionCredential,
  onDeleteAuthConnection,
  onUpdateBilling,
  onVerifyBilling,
  onCreatePolarProduct,
  onUpdateStorage,
  onUploadProjectIcon
}: {
  project: ProjectSummary;
  usersQuery: ReturnType<typeof useQuery<ProjectUsersResponse>>;
  socialProvidersQuery: ReturnType<typeof useQuery<SocialProvidersResponse>>;
  authConnectionsQuery: ReturnType<typeof useQuery<AuthConnectionsResponse>>;
  billingQuery: ReturnType<typeof useQuery<BillingSettings>>;
  storageQuery: ReturnType<typeof useQuery<StorageSettings>>;
  polarProductsQuery: ReturnType<typeof useQuery<PolarProductsResponse>>;
  emailServiceEnabled: boolean;
  resendPendingEmail: string | null;
  resendErrorEmail: string | null;
  resentVerificationEmail: string | null;
  terminatePendingUserId: string | null;
  terminateErrorUserId: string | null;
  terminatedSessionsUserId: string | null;
  updatePending: boolean;
  updateError: string | null;
  socialProviderPending: SocialProviderId | null;
  socialProviderVerifyPending: SocialProviderId | null;
  socialProviderError: string | null;
  billingPending: boolean;
  billingVerifyPending: boolean;
  billingError: string | null;
  storagePending: boolean;
  storageUploadPending: boolean;
  storageError: string | null;
  storageUploadError: string | null;
  uploadedIcon: StorageObject | null;
  polarProductCreatePending: boolean;
  polarProductCreateError: string | null;
  onResendVerification: (email: string) => void;
  onTerminateSessions: (userId: string) => void;
  onUpdateProject: (patch: ProjectSettingsPatch) => void;
  onUpdateSocialProvider: (
    provider: SocialProviderId,
    patch: SocialProviderPatch
  ) => void;
  onVerifySocialProvider: (provider: SocialProviderId) => void;
  onCreateAuthConnection: (
    input: CreateAuthConnectionInput
  ) => Promise<AuthConnectionCredential>;
  onSetAuthConnectionDisabled: (
    clientId: string,
    disabled: boolean
  ) => Promise<void>;
  onRotateAuthConnectionCredential: (
    clientId: string
  ) => Promise<AuthConnectionCredential>;
  onDeleteAuthConnection: (clientId: string) => Promise<void>;
  onUpdateBilling: (patch: BillingSettingsPatch) => void;
  onVerifyBilling: (input: {
    accessToken?: string;
    environment?: BillingSettings["environment"];
  }) => void;
  onCreatePolarProduct: (
    input: CreatePolarProductInput
  ) => Promise<BillingProductMapping>;
  onUpdateStorage: (patch: StorageSettingsPatch) => void;
  onUploadProjectIcon: (file: File) => void;
}) {
  const users = usersQuery.data?.users ?? [];
  const socialProviders = socialProvidersQuery.data?.providers ?? project.socialProviders;
  const socialProviderCatalog = socialProvidersQuery.data?.catalog ?? [];

  return (
    <div className="space-y-10">
      <div>
        <div className="mb-3 flex items-baseline gap-3">
          <span className="eyebrow">00 — App</span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
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
            storageSettings={storageQuery.data ?? null}
            pending={updatePending}
            uploadPending={storageUploadPending}
            error={updateError}
            uploadError={storageUploadError}
            uploadedIcon={uploadedIcon}
            onUploadIcon={onUploadProjectIcon}
            onSubmit={onUpdateProject}
          />
        </Card>
      </section>

      <section>
        <div className="mb-4 flex items-baseline gap-3">
          <span className="eyebrow">02 — Connect</span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
        </div>

        <Card padding={false}>
          <AuthConnectionSettings
            project={project.slug}
            projectName={project.name}
            appUrl={project.appUrl}
            issuer={`${window.location.origin}/api/${project.slug}`}
            data={authConnectionsQuery.data}
            loading={authConnectionsQuery.isLoading}
            loadError={authConnectionsQuery.isError}
            onCreate={onCreateAuthConnection}
            onSetDisabled={onSetAuthConnectionDisabled}
            onRotateCredential={onRotateAuthConnectionCredential}
            onDelete={onDeleteAuthConnection}
          />
        </Card>
      </section>

      <section>
        <div className="mb-4 flex items-baseline gap-3">
          <span className="eyebrow">03 — Social sign-in</span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
        </div>

        <Card>
          {socialProvidersQuery.isLoading ? (
            <div className="p-5 text-[13px] text-muted">Loading providers…</div>
          ) : socialProvidersQuery.isError ? (
            <div className="p-5">
              <FormAlert>Could not load social providers.</FormAlert>
            </div>
          ) : (
            <SocialProviderSettings
              providers={socialProviders}
              catalog={socialProviderCatalog}
              disabled={project.system}
              pendingProvider={socialProviderPending}
              verifyPendingProvider={socialProviderVerifyPending}
              error={socialProviderError}
              onSave={onUpdateSocialProvider}
              onVerify={onVerifySocialProvider}
            />
          )}
        </Card>
      </section>

      <section>
        <div className="mb-4 flex items-baseline gap-3">
          <span className="eyebrow">04 — Billing</span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
        </div>

        <Card>
          {billingQuery.isLoading ? (
            <div className="p-5 text-[13px] text-muted">Loading billing…</div>
          ) : billingQuery.isError || !billingQuery.data ? (
            <div className="p-5">
              <FormAlert>Could not load billing settings.</FormAlert>
            </div>
          ) : (
            <BillingSettingsForm
              settings={billingQuery.data}
              disabled={project.system}
              pending={billingPending}
              verifyPending={billingVerifyPending}
              error={billingError}
              polarProducts={polarProductsQuery.data?.products ?? []}
              polarProductsLoading={polarProductsQuery.isFetching}
              polarProductsError={
                polarProductsQuery.isError ? "Could not load Polar products." : null
              }
              polarProductCreatePending={polarProductCreatePending}
              polarProductCreateError={polarProductCreateError}
              onSave={onUpdateBilling}
              onVerify={onVerifyBilling}
              onCreatePolarProduct={onCreatePolarProduct}
            />
          )}
        </Card>
      </section>

      <section>
        <div className="mb-4 flex items-baseline gap-3">
          <span className="eyebrow">05 — Storage</span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
          <Link
            to="/projects/$projectSlug/files"
            params={{ projectSlug: project.slug }}
            className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] font-semibold text-ink-soft hover:bg-surface-hover"
          >
            Browse files
          </Link>
        </div>

        <Card>
          {storageQuery.isLoading ? (
            <div className="p-5 text-[13px] text-muted">Loading storage…</div>
          ) : storageQuery.isError || !storageQuery.data ? (
            <div className="p-5">
              <FormAlert>Could not load storage settings.</FormAlert>
            </div>
          ) : (
            <StorageSettingsForm
              settings={storageQuery.data}
              disabled={project.system}
              pending={storagePending}
              error={storageError}
              onSave={onUpdateStorage}
            />
          )}
        </Card>
      </section>

      <section>
        <div className="mb-4 flex items-baseline gap-3">
          <span className="eyebrow">06 — Users</span>
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
              description="Users will appear here after they sign up to this app."
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
