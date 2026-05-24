import type { AuthRegistry, RegisteredProject } from "../../auth/registry";
import type { AuthProject } from "../../config/projects";
import {
  SOCIAL_PROVIDER_CATALOG,
  type SocialProviderId
} from "../../config/social-providers";
import { prepareProjectSchema } from "../../db/bootstrap";
import { loadProjectBillingSettings } from "../billing/store";
import { readProjectCounts } from "../users/store";
import {
  loadProjectSocialProviders,
  markSocialProviderVerified,
  readProjectSocialProviders,
  updateProjectSocialProvider,
  type SocialProviderPatch
} from "./social-provider-store";
import {
  createProjectFromInput,
  createProjectSettings,
  projectSettingsExists,
  updateProjectSettings,
  type ProjectSettingsCreate,
  type ProjectSettingsPatch
} from "./store";
import { projectResponse } from "./translator";

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
      publicBaseUrl: string;
      secret: string;
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
        "system_project_locked",
        409,
        "System project is locked"
      );
    }

    if (
      await projectSettingsExists({
        databaseUrl: this.options.databaseUrl,
        adminProject: this.options.adminProject,
        slug: project.slug,
        schema: project.schema
      })
    ) {
      throw new ProjectServiceError("project_exists", 409, "Project already exists");
    }

    try {
      await prepareProjectSchema({
        databaseUrl: this.options.databaseUrl,
        publicBaseUrl: this.options.publicBaseUrl,
        secret: this.options.secret,
        adminProject: this.options.adminProject,
        project
      });

      const created = await createProjectSettings({
        databaseUrl: this.options.databaseUrl,
        adminProject: this.options.adminProject,
        input
      });
      await this.options.registry.updateProject(created);
      return this.projectResponseWithCounts(created);
    } catch (error) {
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
        slug: registered.project.slug,
        patch
      });

      if (!updated) {
        throw new ProjectServiceError("unknown_project", 404, "Unknown project");
      }

      const socialProviders = await loadProjectSocialProviders({
        databaseUrl: this.options.databaseUrl,
        adminProject: this.options.adminProject,
        project: updated,
        encryptionSecret: this.options.secret
      });
      const billing = await loadProjectBillingSettings({
        databaseUrl: this.options.databaseUrl,
        adminProject: this.options.adminProject,
        project: updated,
        encryptionSecret: this.options.secret
      });
      const nextProject = {
        ...updated,
        socialProviders,
        billing
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
      project: registered.project,
      provider,
      patch,
      encryptionSecret: this.options.secret
    });
    await this.options.registry.updateProject({
      ...registered.project,
      socialProviders
    });

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

    await markSocialProviderVerified({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject,
      project: registered.project,
      provider
    });
    const socialProviders = await loadProjectSocialProviders({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject,
      project: registered.project,
      encryptionSecret: this.options.secret
    });
    await this.options.registry.updateProject({
      ...registered.project,
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
