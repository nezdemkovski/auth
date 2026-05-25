import type { Hono } from "hono";
import { cors } from "hono/cors";

import type { AuthRegistry, RegisteredProject } from "../../auth/registry";
import { mediaUploadError } from "../../http/admin/shared";
import { StorageService } from "./core";
import {
  mediaUploadBodyError,
  MediaUploadBodyError,
  MediaUploadPurpose
} from "./media";
import { parseMediaUploadRequest } from "./validator";

type PublicStorageVariables = {
  registry: AuthRegistry;
};

export const registerPublicStorageRoutes = (app: Hono<{ Variables: PublicStorageVariables }>, options: {
    registry: AuthRegistry;
    storageService: StorageService;
  }) => {
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
      allowMethods: ["POST", "OPTIONS"],
      credentials: true,
      maxAge: 600
    })
  );

  app.post("/api/:project/upload", async (c) => {
    const registered = options.registry.get(c.req.param("project"));
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }

    const session = await getProjectSession(registered.auth, c.req.raw.headers);
    if (!session) {
      return c.json({ error: "unauthorized" }, 401);
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
      return c.json({ error: "invalid_body" }, 400);
    }

    try {
      const result = await options.storageService.uploadUserAvatar({
        registered,
        purpose: uploadRequest.purpose,
        file: uploadRequest.file,
        ownerUserId: session.user.id
      });

      return c.json(result);
    } catch (error) {
      return mediaUploadError(error);
    }
  });
};

const getProjectSession = async (auth: RegisteredProject["auth"], headers: Headers) => {
  return auth.api.getSession({ headers });
};
