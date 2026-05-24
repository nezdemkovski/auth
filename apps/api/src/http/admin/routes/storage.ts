import { projectResponse } from "../../translate/project";
import {
  parseMediaUploadRequest,
  parseStorageSettingsPatch
} from "../../validator/storage";
import {
  mediaUploadError,
  requireAdmin,
  type AdminRouteRegistration
} from "../shared";

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

    const registered = options.registry.get(c.req.param("project"));
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }

    return c.json({
      settings: await storageService.readSettings(registered.project)
    });
  });

  app.get("/projects/:project/storage/objects", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const registered = options.registry.get(c.req.param("project"));
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }

    return c.json({
      objects: await storageService.listObjects(registered)
    });
  });

  app.patch("/projects/:project/storage", async (c) => {
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
    const patch = parseStorageSettingsPatch(body);
    if (!patch) {
      return c.json({ error: "invalid_body" }, 400);
    }

    try {
      return c.json({
        settings: await storageService.updateSettings(registered, patch)
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

    const registered = options.registry.get(c.req.param("project"));
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }
    if (registered.project.slug === options.adminProject.slug) {
      return c.json({ error: "system_project_locked" }, 409);
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
        registered,
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
