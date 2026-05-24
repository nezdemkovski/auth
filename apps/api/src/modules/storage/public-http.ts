import type { Hono } from "hono";
import { cors } from "hono/cors";

import type { AuthRegistry } from "../../auth/registry";
import { StorageService } from "./core";
import { MediaUploadError } from "./media";
import { parseMediaUploadRequest } from "./validator";

type PublicStorageVariables = {
  registry: AuthRegistry;
};

export function registerPublicStorageRoutes(
  app: Hono<{ Variables: PublicStorageVariables }>,
  options: {
    registry: AuthRegistry;
    storageService: StorageService;
  }
): void {
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

    const uploadRequest = await parseMediaUploadRequest(
      await c.req.formData(),
      "user_avatar"
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
      if (error instanceof MediaUploadError) {
        return c.json(
          { error: error.code },
          error.code === "storage_not_configured" ? 409 : 400
        );
      }
      throw error;
    }
  });
}

async function getProjectSession(
  auth: unknown,
  headers: Headers
): Promise<{ user: { id: string } } | null> {
  const api = (auth as {
    api: {
      getSession(input: { headers: Headers }): Promise<{ user: { id: string } } | null>;
    };
  }).api;

  return api.getSession({ headers });
}
