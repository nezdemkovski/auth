import { isSocialProviderId } from "../../config/social-providers";
import { ProjectServiceError } from "./core";
import {
  parseProjectCreate,
  parseProjectSettingsPatch,
  parseSocialProviderPatch
} from "./validator";
import {
  parseJson,
  requireAdmin,
  requireMutableProject,
  requireRegisteredProject,
  type AdminRouteRegistration
} from "../../http/admin/shared";

export const registerProjectRoutes: AdminRouteRegistration = ({
  app,
  options,
  projectService
}) => {
  app.get("/projects", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    return c.json({
      projects: await projectService.listProjects()
    });
  });

  app.post("/projects", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const body = await parseJson(c.req);
    const input = parseProjectCreate(body);
    if (!input) {
      return c.json({ error: "invalid_body" }, 400);
    }

    try {
      return c.json(
        {
          project: await projectService.createProject(input)
        },
        201
      );
    } catch (error) {
      return projectServiceError(error);
    }
  });

  app.patch("/projects/:project", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const project = requireMutableProject(options, c.req.param("project"));
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }

    const body = await parseJson(c.req);
    const patch = parseProjectSettingsPatch(body);
    if (!patch) {
      return c.json({ error: "invalid_body" }, 400);
    }

    try {
      return c.json({
        project: await projectService.updateProject(project.registered, patch)
      });
    } catch (error) {
      return projectServiceError(error);
    }
  });

  app.get("/projects/:project/social-providers", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const project = requireRegisteredProject(options, c.req.param("project"));
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }

    return c.json({
      ...(await projectService.readSocialProviders(project.registered.project))
    });
  });

  app.patch("/projects/:project/social-providers/:provider", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const project = requireRegisteredProject(options, c.req.param("project"));
    const provider = c.req.param("provider");
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }
    if (!isSocialProviderId(provider)) {
      return c.json({ error: "unknown_provider" }, 404);
    }

    const body = await parseJson(c.req);
    const patch = parseSocialProviderPatch(body);
    if (!patch) {
      return c.json({ error: "invalid_body" }, 400);
    }

    return c.json({
      ...(await projectService.updateSocialProvider(project.registered, provider, patch))
    });
  });

  app.post("/projects/:project/social-providers/:provider/verify", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const project = requireRegisteredProject(options, c.req.param("project"));
    const provider = c.req.param("provider");
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }
    if (!isSocialProviderId(provider)) {
      return c.json({ error: "unknown_provider" }, 404);
    }

    try {
      return c.json(
        await projectService.verifySocialProvider(
          project.registered,
          provider,
          c.req.raw.headers
        )
      );
    } catch (error) {
      return projectServiceError(error);
    }
  });
};

function projectServiceError(error: unknown): Response {
  if (error instanceof ProjectServiceError) {
    return Response.json(
      {
        error: error.code,
        message: error.message
      },
      { status: error.status }
    );
  }

  throw error;
}
