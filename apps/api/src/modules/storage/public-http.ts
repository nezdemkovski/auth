import type { Hono } from "hono";
import { cors } from "hono/cors";
import {
  mediaUploadBodyError,
  MediaUploadBodyError,
  MediaUploadPurpose,
  parseMediaUploadRequest
} from "@nezdemkovski/auth-storage";
import {
  OAuthResource,
  OAuthScope,
  type OAuthResourceAuthorizer
} from "@nezdemkovski/auth-oauth-resource";

import type { AuthRegistry, RegisteredProject } from "../../auth/registry";
import { mediaUploadError } from "../../http/admin/shared";
import { ErrorCode } from "../../runtime/error-codes";
import type { MediaService } from "../media/core";

type PublicStorageVariables = {
  registry: AuthRegistry;
};

export const registerPublicStorageRoutes = (
  app: Hono<{ Variables: PublicStorageVariables }>,
  options: {
    registry: AuthRegistry;
    authorizer: OAuthResourceAuthorizer<RegisteredProject>;
    mediaService: MediaService;
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
      maxAge: 600
    })
  );

  app.post("/api/:project/upload", async (c) => {
    const access = await options.authorizer.authorizeUser({
      projectSlug: c.req.param("project"),
      request: c.req.raw,
      resource: OAuthResource.Application,
      scopes: [OAuthScope.StorageAvatarWrite]
    });
    if (!access.ok) {
      if (access.failure.wwwAuthenticate) {
        c.header("WWW-Authenticate", access.failure.wwwAuthenticate);
      }
      return c.json({ error: access.failure.error }, access.failure.status);
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
      const result = await options.mediaService.uploadUserAvatar({
        registered: {
          project: access.value.registered.project,
          pool: access.value.registered.projectDb.pool
        },
        purpose: uploadRequest.purpose,
        file: uploadRequest.file,
        ownerUserId: access.value.subject
      });

      return c.json(result);
    } catch (error) {
      return mediaUploadError(error);
    }
  });

  app.delete("/api/:project/upload", async (c) => {
    const access = await options.authorizer.authorizeUser({
      projectSlug: c.req.param("project"),
      request: c.req.raw,
      resource: OAuthResource.Application,
      scopes: [OAuthScope.StorageAvatarDelete]
    });
    if (!access.ok) {
      if (access.failure.wwwAuthenticate) {
        c.header("WWW-Authenticate", access.failure.wwwAuthenticate);
      }
      return c.json({ error: access.failure.error }, access.failure.status);
    }
    try {
      return c.json(
        await options.mediaService.deleteUserAvatar({
          registered: {
            project: access.value.registered.project,
            pool: access.value.registered.projectDb.pool
          },
          ownerUserId: access.value.subject
        })
      );
    } catch (error) {
      return mediaUploadError(error);
    }
  });
};
