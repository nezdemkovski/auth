import type { AuthProject } from "../../../config/projects";
import { SOCIAL_PROVIDER_CATALOG, isSocialProviderId } from "../../../config/social-providers";
import { prepareProjectSchema } from "../../../db/bootstrap";
import { loadProjectBillingSettings } from "../../../db/billing-settings";
import {
  createProjectFromInput,
  createProjectSettings,
  projectSettingsExists,
  updateProjectSettings
} from "../../../db/project-settings";
import {
  loadProjectSocialProviders,
  markSocialProviderVerified,
  readProjectSocialProviders,
  updateProjectSocialProvider
} from "../../../db/social-provider-settings";
import {
  parseProjectCreate,
  parseProjectSettingsPatch,
  parseSocialProviderPatch
} from "../../validator/project";
import { projectResponse } from "../../translate/project";
import {
  readProjectCounts,
  requireAdmin,
  type AdminRouteRegistration
} from "../shared";

export const registerProjectRoutes: AdminRouteRegistration = ({ app, options }) => {
  app.get("/projects", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const projects = await Promise.all(
      options.registry.list().map(async (project) => {
        const registered = options.registry.get(project.slug);
        if (!registered) {
          return null;
        }

        const counts = await readProjectCounts(registered.projectDb.pool);
        return projectResponse(project, counts, options.publicBaseUrl);
      })
    );

    return c.json({
      projects: projects.filter((project) => project !== null)
    });
  });

  app.post("/projects", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const body = await c.req.json().catch(() => ({}));
    const input = parseProjectCreate(body);
    if (!input) {
      return c.json({ error: "invalid_body" }, 400);
    }

    let project: AuthProject;
    try {
      project = createProjectFromInput(input);
    } catch (error) {
      return c.json(
        {
          error: "invalid_project",
          message: error instanceof Error ? error.message : "Invalid project"
        },
        400
      );
    }

    if (project.slug === options.adminProject.slug) {
      return c.json({ error: "system_project_locked" }, 409);
    }

    if (
      await projectSettingsExists({
        databaseUrl: options.databaseUrl,
        adminProject: options.adminProject,
        slug: project.slug,
        schema: project.schema
      })
    ) {
      return c.json({ error: "project_exists" }, 409);
    }

    try {
      await prepareProjectSchema({
        databaseUrl: options.databaseUrl,
        publicBaseUrl: options.publicBaseUrl,
        secret: options.secret,
        adminProject: options.adminProject,
        project
      });

      const created = await createProjectSettings({
        databaseUrl: options.databaseUrl,
        adminProject: options.adminProject,
        input
      });
      await options.registry.updateProject(created);
      const registered = options.registry.get(created.slug);
      const counts = registered ? await readProjectCounts(registered.projectDb.pool) : undefined;

      return c.json(
        {
          project: projectResponse(created, counts, options.publicBaseUrl)
        },
        201
      );
    } catch (error) {
      return c.json(
        {
          error: "create_project_failed",
          message: error instanceof Error ? error.message : "Could not create project"
        },
        400
      );
    }
  });

  app.patch("/projects/:project", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const registered = options.registry.get(c.req.param("project"));
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }

    if (registered.project.slug === options.adminProject.slug) {
      return c.json({ error: "system_project_locked" }, 409);
    }

    const body = await c.req.json().catch(() => ({}));
    const patch = parseProjectSettingsPatch(body);
    if (!patch) {
      return c.json({ error: "invalid_body" }, 400);
    }

    try {
      const updated = await updateProjectSettings({
        databaseUrl: options.databaseUrl,
        adminProject: options.adminProject,
        slug: registered.project.slug,
        patch
      });

      if (!updated) {
        return c.json({ error: "unknown_project" }, 404);
      }

      const socialProviders = await loadProjectSocialProviders({
        databaseUrl: options.databaseUrl,
        adminProject: options.adminProject,
        project: updated,
        encryptionSecret: options.secret
      });
      const billing = await loadProjectBillingSettings({
        databaseUrl: options.databaseUrl,
        adminProject: options.adminProject,
        project: updated,
        encryptionSecret: options.secret
      });
      const nextProject = {
        ...updated,
        socialProviders,
        billing
      };
      await options.registry.updateProject(nextProject);
      const next = options.registry.get(nextProject.slug);
      const counts = next ? await readProjectCounts(next.projectDb.pool) : undefined;

      return c.json({
        project: projectResponse(nextProject, counts, options.publicBaseUrl)
      });
    } catch (error) {
      return c.json(
        {
          error: "invalid_project_settings",
          message: error instanceof Error ? error.message : "Invalid project settings"
        },
        400
      );
    }
  });

  app.get("/projects/:project/social-providers", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const registered = options.registry.get(c.req.param("project"));
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }

    return c.json({
      providers: await readProjectSocialProviders({
        databaseUrl: options.databaseUrl,
        adminProject: options.adminProject,
        project: registered.project,
        publicBaseUrl: options.publicBaseUrl
      }),
      catalog: Object.values(SOCIAL_PROVIDER_CATALOG)
    });
  });

  app.patch("/projects/:project/social-providers/:provider", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const registered = options.registry.get(c.req.param("project"));
    const provider = c.req.param("provider");
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }
    if (!isSocialProviderId(provider)) {
      return c.json({ error: "unknown_provider" }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const patch = parseSocialProviderPatch(body);
    if (!patch) {
      return c.json({ error: "invalid_body" }, 400);
    }

    const socialProviders = await updateProjectSocialProvider({
      databaseUrl: options.databaseUrl,
      adminProject: options.adminProject,
      project: registered.project,
      provider,
      patch,
      encryptionSecret: options.secret
    });
    await options.registry.updateProject({
      ...registered.project,
      socialProviders
    });

    return c.json({
      providers: await readProjectSocialProviders({
        databaseUrl: options.databaseUrl,
        adminProject: options.adminProject,
        project: registered.project,
        publicBaseUrl: options.publicBaseUrl
      }),
      catalog: Object.values(SOCIAL_PROVIDER_CATALOG)
    });
  });

  app.post("/projects/:project/social-providers/:provider/verify", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const registered = options.registry.get(c.req.param("project"));
    const provider = c.req.param("provider");
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }
    if (!isSocialProviderId(provider)) {
      return c.json({ error: "unknown_provider" }, 404);
    }

    const settings = registered.project.socialProviders[provider];
    if (!settings.enabled || !settings.clientId || !settings.clientSecret) {
      return c.json({ error: "provider_not_configured" }, 409);
    }

    const api = registered.auth.api as unknown as {
      signInSocial(input: {
        body: {
          provider: string;
          callbackURL: string;
          errorCallbackURL: string;
          disableRedirect: boolean;
        };
        headers: Headers;
      }): Promise<{ url?: string; redirect: boolean }>;
    };
    const callbackURL = registered.project.trustedOrigins[0] ?? options.publicBaseUrl;
    const result = await api.signInSocial({
      body: {
        provider,
        callbackURL,
        errorCallbackURL: callbackURL,
        disableRedirect: true
      },
      headers: c.req.raw.headers
    });

    if (!result.url) {
      return c.json({ error: "provider_check_failed" }, 409);
    }

    await markSocialProviderVerified({
      databaseUrl: options.databaseUrl,
      adminProject: options.adminProject,
      project: registered.project,
      provider
    });
    const socialProviders = await loadProjectSocialProviders({
      databaseUrl: options.databaseUrl,
      adminProject: options.adminProject,
      project: registered.project,
      encryptionSecret: options.secret
    });
    await options.registry.updateProject({
      ...registered.project,
      socialProviders
    });

    return c.json({
      ok: true,
      providers: await readProjectSocialProviders({
        databaseUrl: options.databaseUrl,
        adminProject: options.adminProject,
        project: registered.project,
        publicBaseUrl: options.publicBaseUrl
      }),
      catalog: Object.values(SOCIAL_PROVIDER_CATALOG)
    });
  });
};
