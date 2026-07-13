import type { Hono } from "hono";
import { cors } from "hono/cors";

import type { AuthRegistry } from "../../auth/registry";
import { OAuthResource, OAuthScope } from "../../config/oauth-resources";
import { mediaUploadError } from "../../http/admin/shared";
import { ErrorCode } from "../../runtime/error-codes";
import { authorizeUserOAuthResourceRequest } from "../oauth-resource/http";
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
    publicBaseUrl: string;
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
      maxAge: 600
    })
  );

  app.post("/api/:project/upload", async (c) => {
    const access = await authorizeUserOAuthResourceRequest({
      registry: options.registry,
      publicBaseUrl: options.publicBaseUrl,
      projectSlug: c.req.param("project"),
      request: c.req.raw,
      resource: OAuthResource.Storage,
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
      const result = await options.storageService.uploadUserAvatar({
        registered: access.value.registered,
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
    const access = await authorizeUserOAuthResourceRequest({
      registry: options.registry,
      publicBaseUrl: options.publicBaseUrl,
      projectSlug: c.req.param("project"),
      request: c.req.raw,
      resource: OAuthResource.Storage,
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
        await options.storageService.deleteUserAvatar({
          registered: access.value.registered,
          ownerUserId: access.value.subject
        })
      );
    } catch (error) {
      return mediaUploadError(error);
    }
  });
};
