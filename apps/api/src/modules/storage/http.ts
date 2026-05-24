import { projectResponse } from "../projects/translator";
import {
  parseMediaUploadRequest,
  parseStorageSettingsPatch
} from "./validator";
import {
  mediaUploadError,
  requireAdmin,
  requireMutableProject,
  requireRegisteredProject,
  type AdminRouteRegistration
} from "../../http/admin/shared";

export const registerStorageRoutes: AdminRouteRegistration = ({
  app,
  options,
  storageService
}) => {
  app.get("/projects/:project/storage", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const project = requireRegisteredProject(options, c.req.param("project"));
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }

    return c.json({
      settings: await storageService.readSettings(project.registered.project)
    });
  });

  app.get("/projects/:project/storage/objects", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const project = requireRegisteredProject(options, c.req.param("project"));
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }

    return c.json({
      objects: await storageService.listObjects(project.registered)
    });
  });

  app.patch("/projects/:project/storage", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const project = requireMutableProject(options, c.req.param("project"));
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }

    const body = await c.req.json().catch(() => ({}));
    const patch = parseStorageSettingsPatch(body);
    if (!patch) {
      return c.json({ error: "invalid_body" }, 400);
    }

    try {
      return c.json({
        settings: await storageService.updateSettings(project.registered, patch)
      });
    } catch (error) {
      return c.json(
        {
          error: "invalid_storage_settings",
          message: error instanceof Error ? error.message : "Invalid storage settings"
        },
        400
      );
    }
  });

  app.post("/projects/:project/upload", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const project = requireMutableProject(options, c.req.param("project"));
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }

    const uploadRequest = await parseMediaUploadRequest(
      await c.req.formData(),
      "project_icon"
    );
    if (!uploadRequest) {
      return c.json({ error: "invalid_body" }, 400);
    }

    try {
      const result = await storageService.uploadProjectIcon({
        registered: project.registered,
        purpose: uploadRequest.purpose,
        file: uploadRequest.file,
        ownerUserId: admin.session.user.id
      });

      return c.json({
        upload: result.upload,
        project: result.project ? projectResponse(result.project) : null
      });
    } catch (error) {
      return mediaUploadError(error);
    }
  });
};
