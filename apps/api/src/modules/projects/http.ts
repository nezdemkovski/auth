import {
  isSocialProviderId,
  parseRealmCreate,
  parseRealmSettingsPatch,
  parseSocialProviderPatch
} from "@nezdemkovski/auth-realm";
import { ErrorCode } from "../../runtime/error-codes";
import { ProjectServiceError } from "./core";
import {
  auditLog,
  domainErrorResponse,
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
      return c.json({ error: ErrorCode.Unauthorized }, 401);
    }

    return c.json({
      projects: await projectService.listProjects()
    });
  });

  app.post("/projects", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: ErrorCode.Unauthorized }, 401);
    }

    const body = await parseJson(c.req);
    const input = parseRealmCreate(body);
    if (!input) {
      return c.json({ error: ErrorCode.InvalidBody }, 400);
    }

    try {
      const project = await projectService.createProject(input);
      auditLog("project.created", {
        actorId: admin.session.user.id,
        actorEmail: admin.session.user.email,
        projectSlug: project.slug
      });
      return c.json({ project }, 201);
    } catch (error) {
      return projectServiceError(error);
    }
  });

  app.patch("/projects/:project", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: ErrorCode.Unauthorized }, 401);
    }

    const project = requireMutableProject(options, c.req.param("project"));
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }

    const body = await parseJson(c.req);
    const patch = parseRealmSettingsPatch(body);
    if (!patch) {
      return c.json({ error: ErrorCode.InvalidBody }, 400);
    }

    try {
      const updated = await projectService.updateProject(project.registered, patch);
      auditLog("project.updated", {
        actorId: admin.session.user.id,
        actorEmail: admin.session.user.email,
        projectSlug: updated.slug
      });
      return c.json({
        project: updated
      });
    } catch (error) {
      return projectServiceError(error);
    }
  });

  app.get("/projects/:project/social-providers", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: ErrorCode.Unauthorized }, 401);
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
      return c.json({ error: ErrorCode.Unauthorized }, 401);
    }

    const project = requireRegisteredProject(options, c.req.param("project"));
    const provider = c.req.param("provider");
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }
    if (!isSocialProviderId(provider)) {
      return c.json({ error: ErrorCode.UnknownProvider }, 404);
    }

    const body = await parseJson(c.req);
    const patch = parseSocialProviderPatch(body);
    if (!patch) {
      return c.json({ error: ErrorCode.InvalidBody }, 400);
    }

    try {
      const updated = await projectService.updateSocialProvider(
        project.registered,
        provider,
        patch
      );
      auditLog("project.social_provider.updated", {
        actorId: admin.session.user.id,
        actorEmail: admin.session.user.email,
        projectSlug: project.registered.project.slug,
        provider
      });
      return c.json({
        ...updated
      });
    } catch (error) {
      return projectServiceError(error);
    }
  });

  app.post("/projects/:project/social-providers/:provider/verify", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: ErrorCode.Unauthorized }, 401);
    }

    const project = requireRegisteredProject(options, c.req.param("project"));
    const provider = c.req.param("provider");
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }
    if (!isSocialProviderId(provider)) {
      return c.json({ error: ErrorCode.UnknownProvider }, 404);
    }

    try {
      const result = await projectService.verifySocialProvider(
        project.registered,
        provider,
        c.req.raw.headers
      );
      auditLog("project.social_provider.verified", {
        actorId: admin.session.user.id,
        actorEmail: admin.session.user.email,
        projectSlug: project.registered.project.slug,
        provider
      });
      return c.json(result);
    } catch (error) {
      return projectServiceError(error);
    }
  });
};

const projectServiceError = (error: unknown) => {
  if (error instanceof ProjectServiceError) {
    return domainErrorResponse(error);
  }

  throw error;
};
