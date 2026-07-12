import type { AuthRegistry, RegisteredProject } from "../../auth/registry";
import {
  normalizeProjectSlug,
  projectSchemaFromSlug,
  validateProjectSchema,
  validateProjectSlug,
  type AuthProject
} from "../../config/projects";
import {
  SOCIAL_PROVIDER_CATALOG,
  supportsSocialProviderCredentialCheck,
  type SocialProviderId
} from "../../config/social-providers";
import { ErrorCode } from "../../runtime/error-codes";
import { prepareProjectSchema } from "../../db/bootstrap";
import type { AdminDatabase } from "../../db/admin-pool";
import { isPostgresUniqueViolation } from "../../db/errors";
import { cloneDefaultBilling, loadProjectBillingSettings } from "../billing/store";
import { readProjectCounts } from "../users/store";
import {
  loadProjectSocialProviders,
  markSocialProviderVerified,
  readProjectSocialProviders,
  updateProjectSocialProvider,
  cloneDefaultSocialProviders,
  type SocialProviderPatch
} from "./social-provider-store";
import {
  createProjectSettings,
  deleteProjectSettings,
  dropProjectSchema,
  projectSettingsExists,
  updateProjectSettings
} from "./store";
import { projectResponse } from "./translator";
import {
  cloneDefaultStorage,
  loadProjectStorageSettings
} from "../storage/settings-store";
import {
  normalizeProjectFeatures,
  type ProjectSettingsCreate,
  type ProjectSettingsPatch
} from "./validator";
import { logError } from "../../runtime/logger";

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

        const counts = await readProjectCounts(registered.projectDb.pool);
        return projectResponse(project, counts, this.options.publicBaseUrl);
      })
    );

    return projects.filter((project) => project !== null);
  }

  async createProject(input: ProjectSettingsCreate) {
    let project: AuthProject;
    try {
      project = createProjectFromInput(input);
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
      await projectSettingsExists({
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
    try {
      const created = await createProjectSettings({
        databaseUrl: this.options.databaseUrl,
        adminProject: this.options.adminProject,
        adminDb: this.options.adminDb,
        project
      });
      settingsCreated = true;

      schemaCreationStarted = true;
      await prepareProjectSchema({
        databaseUrl: this.options.databaseUrl,
        publicBaseUrl: this.options.publicBaseUrl,
        secret: this.options.secret,
        project
      });
      await this.options.registry.updateProject(created);
      return this.projectResponseWithCounts(created);
    } catch (error) {
      if (settingsCreated) {
        await deleteProjectSettings({
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
        await dropProjectSchema({
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

  async updateProject(registered: RegisteredProject, patch: ProjectSettingsPatch) {
    try {
      const updated = await updateProjectSettings({
        databaseUrl: this.options.databaseUrl,
        adminProject: this.options.adminProject,
        adminDb: this.options.adminDb,
        slug: registered.project.slug,
        patch
      });

      if (!updated) {
        throw new ProjectServiceError(ErrorCode.UnknownProject, 404, "Unknown project");
      }

      const socialProviders = await loadProjectSocialProviders({
        databaseUrl: this.options.databaseUrl,
        adminProject: this.options.adminProject,
        adminDb: this.options.adminDb,
        project: updated,
        encryptionSecret: this.options.encryptionSecret
      });
      const billing = await loadProjectBillingSettings({
        databaseUrl: this.options.databaseUrl,
        adminProject: this.options.adminProject,
        adminDb: this.options.adminDb,
        project: updated,
        encryptionSecret: this.options.encryptionSecret
      });
      const storage = await loadProjectStorageSettings({
        databaseUrl: this.options.databaseUrl,
        adminProject: this.options.adminProject,
        adminDb: this.options.adminDb,
        project: updated,
        encryptionSecret: this.options.encryptionSecret,
        managedStorage: this.options.managedStorage
      });
      const nextProject = {
        ...updated,
        socialProviders,
        billing,
        storage
      };
      await this.options.registry.updateProject(nextProject);

      return this.projectResponseWithCounts(nextProject);
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

  async readSocialProviders(project: AuthProject) {
    return {
      providers: await readProjectSocialProviders({
        databaseUrl: this.options.databaseUrl,
        adminProject: this.options.adminProject,
        adminDb: this.options.adminDb,
        project,
        publicBaseUrl: this.options.publicBaseUrl
      }),
      catalog: Object.values(SOCIAL_PROVIDER_CATALOG)
    };
  }

  async updateSocialProvider(
    registered: RegisteredProject,
    provider: SocialProviderId,
    patch: SocialProviderPatch
  ) {
    const socialProviders = await updateProjectSocialProvider({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject,
      adminDb: this.options.adminDb,
      project: registered.project,
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
    if (!supportsSocialProviderCredentialCheck(provider)) {
      throw new ProjectServiceError(
        "provider_check_not_supported",
        409,
        "Telegram credentials are verified during Mini App sign-in"
      );
    }
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

    await markSocialProviderVerified({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject,
      adminDb: this.options.adminDb,
      project: registered.project,
      provider
    });
    const socialProviders = await loadProjectSocialProviders({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject,
      adminDb: this.options.adminDb,
      project: registered.project,
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

  private async projectResponseWithCounts(project: AuthProject) {
    const registered = this.options.registry.get(project.slug);
    const counts = registered ? await readProjectCounts(registered.projectDb.pool) : undefined;
    return projectResponse(project, counts, this.options.publicBaseUrl);
  }
}

export const createProjectFromInput = (input: ProjectSettingsCreate) => {
  const slug = normalizeProjectSlug(input.slug);
  validateProjectSlug(slug);

  const project = {
    slug,
    name: input.name.trim(),
    schema: projectSchemaFromSlug(slug),
    description: input.description.trim(),
    iconUrl: input.iconUrl.trim(),
    appUrl: input.appUrl.trim(),
    trustedOrigins: input.trustedOrigins.map((origin) => origin.trim()).filter(Boolean),
    features: normalizeProjectFeatures(input.features),
    socialProviders: cloneDefaultSocialProviders(),
    billing: cloneDefaultBilling(),
    storage: cloneDefaultStorage()
  };

  validateProjectSchema(project.schema);
  return project;
};
