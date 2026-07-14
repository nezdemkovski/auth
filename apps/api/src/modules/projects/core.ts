import type { AuthRegistry, RegisteredProject } from "../../auth/registry";
import { cloneDefaultBilling } from "@nezdemkovski/auth-billing";
import { readIdentityCounts } from "@nezdemkovski/auth-identity";
import {
  createRealmFromInput,
  createRealmSettings,
  deleteRealmSettings,
  dropRealmSchema,
  loadRealmSocialProviders,
  markRealmSocialProviderVerified,
  readRealmSocialProviders,
  realmSettingsExists,
  updateRealmSettings,
  updateRealmSocialProvider,
  type RealmSettingsCreate,
  type RealmSettingsPatch,
  type SocialProviderId,
  type SocialProviderPatch
} from "@nezdemkovski/auth-realm";
import type { AuthProject } from "../../config/projects";
import { ErrorCode } from "../../runtime/error-codes";
import { prepareProjectSchema } from "../../db/bootstrap";
import type { AdminDatabase } from "../../db/admin-pool";
import { isPostgresUniqueViolation } from "../../db/errors";
import { adminProjectResponse } from "../../application/admin-project-translator";
import { socialProvidersResponse } from "./translator";
import {
  cloneDefaultStorage
} from "@nezdemkovski/auth-storage";
import { logError } from "../../runtime/logger";
import {
  AuthConnectionKind,
  type CreateApplicationConnectionInput
} from "../auth-connections/model";
import { authConnectionClientInput } from "../auth-connections/core";
import type { ProjectCreateInput } from "./validator";

export class ProjectServiceError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 404 | 409,
    message = code
  ) {
    super(message);
    this.name = "ProjectServiceError";
  }
}

export class ProjectService {
  constructor(
    private readonly options: {
      registry: AuthRegistry;
      databaseUrl: string;
      adminProject: AuthProject;
      adminDb?: AdminDatabase;
      publicBaseUrl: string;
      secret: string;
      encryptionSecret: string;
      managedStorage: AuthProject["storage"];
    }
  ) {}

  async listProjects() {
    const projects = await Promise.all(
      this.options.registry.list().map(async (project) => {
        const registered = this.options.registry.get(project.slug);
        if (!registered) {
          return null;
        }

        const counts = await readIdentityCounts(registered.projectDb.pool);
        return adminProjectResponse(project, counts, this.options.publicBaseUrl);
      })
    );

    return projects.filter((project) => project !== null);
  }

  async createProject(input: ProjectCreateInput) {
    let project: AuthProject;
    try {
      project = createProjectFromInput(input.realm);
    } catch (error) {
      throw new ProjectServiceError(
        "invalid_project",
        400,
        error instanceof Error ? error.message : "Invalid project"
      );
    }

    if (project.slug === this.options.adminProject.slug) {
      throw new ProjectServiceError(
        ErrorCode.SystemProjectLocked,
        409,
        "System project is locked"
      );
    }

    if (
      await realmSettingsExists({
        databaseUrl: this.options.databaseUrl,
        adminProject: this.options.adminProject,
        adminDb: this.options.adminDb,
        slug: project.slug,
        schema: project.schema
      })
    ) {
      throw new ProjectServiceError("project_exists", 409, "Project already exists");
    }

    let schemaCreationStarted = false;
    let settingsCreated = false;
    let registryCreated = false;
    try {
      const created = await createRealmSettings({
        databaseUrl: this.options.databaseUrl,
        adminProject: this.options.adminProject,
        adminDb: this.options.adminDb,
        realm: project
      });
      settingsCreated = true;
      const createdProject = {
        ...project,
        ...created
      };

      schemaCreationStarted = true;
      await prepareProjectSchema({
        databaseUrl: this.options.databaseUrl,
        publicBaseUrl: this.options.publicBaseUrl,
        secret: this.options.secret,
        project
      });
      await this.options.registry.updateProject(createdProject);
      registryCreated = true;
      const registered = this.options.registry.get(createdProject.slug);
      if (!registered) {
        throw new Error("Created realm is not registered");
      }
      const application: CreateApplicationConnectionInput = {
        kind: AuthConnectionKind.Application,
        name: `${createdProject.name} app`,
        appUrl: createdProject.appUrl
      };
      const integration = await registered.auth.oauthClientManagement.create(
        authConnectionClientInput(
          application,
          registered,
          this.options.publicBaseUrl
        )
      );

      return {
        project: await this.adminProjectResponseWithCounts(createdProject),
        integration
      };
    } catch (error) {
      if (registryCreated) {
        await this.options.registry.removeProject(project.slug).catch((cleanupError) => {
          logError("project_registry_cleanup_failed", {
            slug: project.slug,
            error:
              cleanupError instanceof Error
                ? cleanupError.message
                : String(cleanupError)
          });
        });
      }

      if (settingsCreated) {
        await deleteRealmSettings({
          databaseUrl: this.options.databaseUrl,
          adminProject: this.options.adminProject,
          adminDb: this.options.adminDb,
          slug: project.slug
        }).catch((cleanupError) => {
          logError("project_settings_cleanup_failed", {
            slug: project.slug,
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          });
        });
      }

      if (schemaCreationStarted) {
        await dropRealmSchema({
          databaseUrl: this.options.databaseUrl,
          adminProject: this.options.adminProject,
          adminDb: this.options.adminDb,
          schema: project.schema
        }).catch((cleanupError) => {
          logError("project_schema_cleanup_failed", {
            slug: project.slug,
            schema: project.schema,
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          });
        });
      }

      if (isPostgresUniqueViolation(error)) {
        throw new ProjectServiceError("project_exists", 409, "Project already exists");
      }

      throw new ProjectServiceError(
        "create_project_failed",
        400,
        error instanceof Error ? error.message : "Could not create project"
      );
    }
  }

  async updateProject(registered: RegisteredProject, patch: RealmSettingsPatch) {
    try {
      const updated = await updateRealmSettings({
        databaseUrl: this.options.databaseUrl,
        adminProject: this.options.adminProject,
        adminDb: this.options.adminDb,
        slug: registered.project.slug,
        patch
      });

      if (!updated) {
        throw new ProjectServiceError(ErrorCode.UnknownProject, 404, "Unknown project");
      }
      const projectWithCurrentCapabilities = {
        ...registered.project,
        ...updated
      };

      const socialProviders = await loadRealmSocialProviders({
        databaseUrl: this.options.databaseUrl,
        adminProject: this.options.adminProject,
        adminDb: this.options.adminDb,
        realm: projectWithCurrentCapabilities,
        encryptionSecret: this.options.encryptionSecret
      });
      const nextProject = {
        ...projectWithCurrentCapabilities,
        socialProviders
      };
      await this.options.registry.updateProject(nextProject);

      return this.adminProjectResponseWithCounts(nextProject);
    } catch (error) {
      if (error instanceof ProjectServiceError) {
        throw error;
      }
      throw new ProjectServiceError(
        "invalid_project_settings",
        400,
        error instanceof Error ? error.message : "Invalid project settings"
      );
    }
  }

  async enableOAuthProvider(registered: RegisteredProject) {
    if (registered.project.features.oauthProvider.enabled) {
      return registered;
    }

    const project = registered.project;
    await this.updateProject(registered, {
      name: project.name,
      description: project.description,
      iconUrl: project.iconUrl,
      appUrl: project.appUrl,
      trustedOrigins: project.trustedOrigins,
      features: {
        ...project.features,
        oauthProvider: {
          ...project.features.oauthProvider,
          enabled: true
        }
      }
    });

    const enabled = this.options.registry.get(project.slug);
    if (!enabled) {
      throw new ProjectServiceError(
        ErrorCode.UnknownProject,
        404,
        "Unknown project"
      );
    }
    return enabled;
  }

  async readSocialProviders(project: AuthProject) {
    const providers = await readRealmSocialProviders({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject,
      adminDb: this.options.adminDb,
      realm: project
    });
    return socialProvidersResponse(project, providers, this.options.publicBaseUrl);
  }

  async updateSocialProvider(
    registered: RegisteredProject,
    provider: SocialProviderId,
    patch: SocialProviderPatch
  ) {
    const socialProviders = await updateRealmSocialProvider({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject,
      adminDb: this.options.adminDb,
      realm: registered.project,
      provider,
      patch,
      encryptionSecret: this.options.encryptionSecret
    });
    const nextProject = {
      ...registered.project,
      socialProviders
    };
    await prepareProjectSchema({
      databaseUrl: this.options.databaseUrl,
      publicBaseUrl: this.options.publicBaseUrl,
      secret: this.options.secret,
      project: nextProject
    });
    await this.options.registry.updateProject(nextProject);

    return this.readSocialProviders(registered.project);
  }

  async verifySocialProvider(
    registered: RegisteredProject,
    provider: SocialProviderId,
    headers: Headers
  ) {
    const settings = registered.project.socialProviders[provider];
    if (!settings.enabled || !settings.clientId || !settings.clientSecret) {
      throw new ProjectServiceError(
        "provider_not_configured",
        409,
        "Provider is not configured"
      );
    }

    const callbackURL = registered.project.trustedOrigins[0] ?? this.options.publicBaseUrl;
    const result = await registered.auth.api.signInSocial({
      body: {
        provider,
        callbackURL,
        errorCallbackURL: callbackURL,
        disableRedirect: true
      },
      headers
    });

    if (!result.url) {
      throw new ProjectServiceError(
        "provider_check_failed",
        409,
        "Provider check failed"
      );
    }

    await markRealmSocialProviderVerified({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject,
      adminDb: this.options.adminDb,
      realm: registered.project,
      provider
    });
    const socialProviders = await loadRealmSocialProviders({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject,
      adminDb: this.options.adminDb,
      realm: registered.project,
      encryptionSecret: this.options.encryptionSecret
    });
    await this.options.registry.patchProject(registered.project.slug, {
      socialProviders
    });

    return {
      ok: true,
      ...(await this.readSocialProviders(registered.project))
    };
  }

  private async adminProjectResponseWithCounts(project: AuthProject) {
    const registered = this.options.registry.get(project.slug);
    const counts = registered ? await readIdentityCounts(registered.projectDb.pool) : undefined;
    return adminProjectResponse(project, counts, this.options.publicBaseUrl);
  }
}

export const createProjectFromInput = (input: RealmSettingsCreate) => {
  const realm = createRealmFromInput(input);

  return {
    ...realm,
    billing: cloneDefaultBilling(),
    storage: cloneDefaultStorage()
  };
};
