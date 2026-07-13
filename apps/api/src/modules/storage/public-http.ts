import type { Hono } from "hono";
import { cors } from "hono/cors";

import type { AuthRegistry } from "../../auth/registry";
import { mediaUploadError } from "../../http/admin/shared";
import { isTrustedProjectMutation } from "../../http/project-csrf";
import { requireProjectSession } from "../../http/project-session";
import { ErrorCode } from "../../runtime/error-codes";
import { StorageService } from "./core";
import { mediaUploadBodyError, MediaUploadBodyError, MediaUploadPurpose } from "./media";
import { parseMediaUploadRequest } from "./validator";

type PublicStorageVariables = {
  registry: AuthRegistry;
};

export const registerPublicStorageRoutes = (
  app: Hono<{ Variables: PublicStorageVariables }>,
  options: {
    registry: AuthRegistry;
    storageService: StorageService;
  }
) => {
  app.use(
    "/api/:project/upload",
    cors({
      origin: (origin, c) => {
        const project = c.req.param("project");
        if (!project) {
          return "";
        }

        return options.registry.isTrustedOrigin(project, origin) ? origin : "";
      },
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["POST", "DELETE", "OPTIONS"],
      credentials: true,
      maxAge: 600
    })
  );

  app.post("/api/:project/upload", async (c) => {
    if (!isTrustedProjectMutation(options.registry, c.req.param("project"), c.req.raw.headers)) {
      return c.json({ error: ErrorCode.ForbiddenOrigin }, 403);
    }
    const access = await requireProjectSession(
      options.registry,
      c.req.param("project"),
      c.req.raw.headers
    );
    if (!access.ok) {
      return c.json({ error: access.error }, access.status);
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
      MediaUploadPurpose.UserAvatar
    );
    if (!uploadRequest) {
      return c.json({ error: ErrorCode.InvalidBody }, 400);
    }

    try {
      const result = await options.storageService.uploadUserAvatar({
        registered: access.registered,
        purpose: uploadRequest.purpose,
        file: uploadRequest.file,
        ownerUserId: access.session.user.id
      });

      return c.json(result);
    } catch (error) {
      return mediaUploadError(error);
    }
  });

  app.delete("/api/:project/upload", async (c) => {
    if (!isTrustedProjectMutation(options.registry, c.req.param("project"), c.req.raw.headers)) {
      return c.json({ error: ErrorCode.ForbiddenOrigin }, 403);
    }
    const access = await requireProjectSession(
      options.registry,
      c.req.param("project"),
      c.req.raw.headers
    );
    if (!access.ok) {
      return c.json({ error: access.error }, access.status);
    }
    try {
      return c.json(
        await options.storageService.deleteUserAvatar({
          registered: access.registered,
          ownerUserId: access.session.user.id
        })
      );
    } catch (error) {
      return mediaUploadError(error);
    }
  });
};
