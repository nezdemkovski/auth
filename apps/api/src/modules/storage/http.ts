import { projectResponse } from "../projects/translator";
import { ErrorCode } from "../../runtime/error-codes";
import {
  mediaUploadBodyError,
  MediaUploadBodyError,
  MediaUploadPurpose
} from "./media";
import {
  parseMediaUploadRequest,
  parseStorageSettingsPatch
} from "./validator";
import {
  auditLog,
  mediaUploadError,
  parseJson,
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
      return c.json({ error: ErrorCode.Unauthorized }, 401);
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
      return c.json({ error: ErrorCode.Unauthorized }, 401);
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
      return c.json({ error: ErrorCode.Unauthorized }, 401);
    }

    const project = requireMutableProject(options, c.req.param("project"));
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }

    const body = await parseJson(c.req);
    const patch = parseStorageSettingsPatch(body);
    if (!patch) {
      return c.json({ error: ErrorCode.InvalidBody }, 400);
    }

    try {
      const settings = await storageService.updateSettings(project.registered, patch);
      auditLog("storage.settings.updated", {
        actorId: admin.session.user.id,
        actorEmail: admin.session.user.email,
        projectSlug: project.registered.project.slug
      });
      return c.json({
        settings
      });
    } catch (error) {
      return c.json(
        {
          error: ErrorCode.InvalidStorageSettings,
          message: error instanceof Error ? error.message : "Invalid storage settings"
        },
        400
      );
    }
  });

  app.post("/projects/:project/upload", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: ErrorCode.Unauthorized }, 401);
    }

    const project = requireMutableProject(options, c.req.param("project"));
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }
    const bodyError = mediaUploadBodyError(c.req.raw.headers.get("content-length"));
    if (bodyError) {
      return c.json(
        { error: bodyError },
        bodyError === MediaUploadBodyError.LengthRequired ? 411 : 413
      );
    }

    const uploadRequest = await parseMediaUploadRequest(
      await c.req.formData(),
      MediaUploadPurpose.ProjectIcon
    );
    if (!uploadRequest) {
      return c.json({ error: ErrorCode.InvalidBody }, 400);
    }

    try {
      const result = await storageService.uploadProjectIcon({
        registered: project.registered,
        purpose: uploadRequest.purpose,
        file: uploadRequest.file,
        ownerUserId: admin.session.user.id
      });
      auditLog("storage.project_icon.uploaded", {
        actorId: admin.session.user.id,
        actorEmail: admin.session.user.email,
        projectSlug: project.registered.project.slug
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
