import {
  mediaUploadBodyError,
  MediaUploadBodyError,
  MediaUploadPurpose,
  parseMediaUploadRequest,
  parseStorageSettingsPatch,
  type StorageService
} from "@nezdemkovski/auth-storage";
import type { Hono } from "hono";

import { adminProjectResponse } from "../../application/admin-project-translator";
import {
  auditLog,
  mediaUploadError,
  parseJson,
  requireAdmin,
  requireMutableProject,
  requireRegisteredProject,
  type AdminProjectLookupOptions
} from "../../http/admin/shared";
import { ErrorCode } from "../../runtime/error-codes";
import type { MediaService } from "../media/core";

type StorageRouteContext = {
  app: Hono;
  options: AdminProjectLookupOptions;
  mediaService: MediaService;
  storageService: StorageService;
};

export const registerStorageRoutes = ({
  app,
  options,
  mediaService,
  storageService
}: StorageRouteContext) => {
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
      settings: await storageService.readSettings(project.registered.project.slug)
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
      objects: await storageService.listObjects({
        slug: project.registered.project.slug,
        storage: project.registered.project.storage,
        pool: project.registered.projectDb.pool
      })
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
      const settings = await storageService.updateSettings(
        project.registered.project.slug,
        patch
      );
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
      const result = await mediaService.uploadProjectIcon({
        registered: {
          project: project.registered.project,
          pool: project.registered.projectDb.pool
        },
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
        project: result.project ? adminProjectResponse(result.project) : null
      });
    } catch (error) {
      return mediaUploadError(error);
    }
  });
};
