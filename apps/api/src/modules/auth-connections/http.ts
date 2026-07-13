import type { Context, Hono } from "hono";

import type { RegisteredProject } from "../../auth/registry";
import {
  auditLog,
  domainErrorResponse,
  parseJson,
  requireAdmin,
  requireMutableProject,
  type AdminProjectLookupOptions,
  type AdminSession
} from "../../http/admin/shared";
import { ErrorCode } from "../../runtime/error-codes";
import {
  AuthConnectionService,
  AuthConnectionServiceError
} from "./core";
import type { AuthConnectionKind } from "./model";
import {
  authConnectionCatalogResponse,
  authConnectionCredentialResponse,
  authConnectionResponse
} from "./translator";
import {
  parseAuthConnectionCreate,
  parseAuthConnectionId,
  parseAuthConnectionUpdate
} from "./validator";

type AuthConnectionRouteContext = {
  app: Hono;
  options: AdminProjectLookupOptions;
  authConnectionService: AuthConnectionService;
};

type AdminAccess = {
  registered: RegisteredProject;
  session: AdminSession;
};

type AuthConnectionProjectAccess =
  | {
      admin: AdminAccess;
      registered: RegisteredProject;
      error?: never;
      status?: never;
    }
  | {
      error:
        | ErrorCode.Unauthorized
        | ErrorCode.UnknownProject
        | ErrorCode.SystemProjectLocked;
      status: 401 | 404 | 409;
      admin?: never;
      registered?: never;
    };

export const registerAuthConnectionRoutes = ({
  app,
  options,
  authConnectionService
}: AuthConnectionRouteContext) => {
  app.get("/projects/:project/auth-connections", async (c) => {
    const access = await requireAuthConnectionProject(
      options,
      c.req.raw.headers,
      c.req.param("project")
    );
    if (access.error) {
      return c.json({ error: access.error }, access.status);
    }

    try {
      const connections = await authConnectionService.list(access.registered);
      return c.json({
        connections: connections.map(authConnectionResponse),
        catalog: authConnectionCatalogResponse()
      });
    } catch (error) {
      return authConnectionError(error);
    }
  });

  app.get("/projects/:project/auth-connections/:clientId", async (c) => {
    const access = await requireAuthConnectionProject(
      options,
      c.req.raw.headers,
      c.req.param("project")
    );
    if (access.error) {
      return c.json({ error: access.error }, access.status);
    }
    const clientId = parseAuthConnectionId(c.req.param("clientId"));
    if (!clientId) {
      return c.json({ error: ErrorCode.InvalidOAuthClient }, 400);
    }

    try {
      const connection = await authConnectionService.get(
        access.registered,
        clientId
      );
      return c.json({ connection: authConnectionResponse(connection) });
    } catch (error) {
      return authConnectionError(error);
    }
  });

  app.post("/projects/:project/auth-connections", async (c) => {
    const access = await requireAuthConnectionProject(
      options,
      c.req.raw.headers,
      c.req.param("project")
    );
    if (access.error) {
      return c.json({ error: access.error }, access.status);
    }
    const input = parseAuthConnectionCreate(await parseJson(c.req));
    if (!input) {
      return c.json({ error: ErrorCode.InvalidBody }, 400);
    }

    try {
      const created = await authConnectionService.create(
        access.registered,
        input
      );
      auditConnectionChange("auth_connection.created", access, {
        clientId: created.client.clientId,
        kind: input.kind
      });
      return c.json(
        {
          connection: authConnectionResponse(created.client),
          credential: authConnectionCredentialResponse(created.credential)
        },
        201
      );
    } catch (error) {
      return authConnectionError(error);
    }
  });

  app.patch("/projects/:project/auth-connections/:clientId", async (c) => {
    const access = await requireAuthConnectionProject(
      options,
      c.req.raw.headers,
      c.req.param("project")
    );
    if (access.error) {
      return c.json({ error: access.error }, access.status);
    }
    const clientId = parseAuthConnectionId(c.req.param("clientId"));
    const input = parseAuthConnectionUpdate(await parseJson(c.req));
    if (!clientId || !input) {
      return c.json({ error: ErrorCode.InvalidBody }, 400);
    }

    try {
      const connection = await authConnectionService.update(
        access.registered,
        clientId,
        input
      );
      auditConnectionChange("auth_connection.updated", access, { clientId });
      return c.json({ connection: authConnectionResponse(connection) });
    } catch (error) {
      return authConnectionError(error);
    }
  });

  app.post(
    "/projects/:project/auth-connections/:clientId/rotate-credential",
    async (c) => {
      const access = await requireAuthConnectionProject(
        options,
        c.req.raw.headers,
        c.req.param("project")
      );
      if (access.error) {
        return c.json({ error: access.error }, access.status);
      }
      const clientId = parseAuthConnectionId(c.req.param("clientId"));
      if (!clientId) {
        return c.json({ error: ErrorCode.InvalidOAuthClient }, 400);
      }

      try {
        const credential = await authConnectionService.rotateSecret(
          access.registered,
          clientId
        );
        auditConnectionChange("auth_connection.credential_rotated", access, {
          clientId
        });
        return c.json({
          credential: authConnectionCredentialResponse(credential)
        });
      } catch (error) {
        return authConnectionError(error);
      }
    }
  );

  app.post(
    "/projects/:project/auth-connections/:clientId/disable",
    async (c) => {
      return setConnectionDisabled(c, options, authConnectionService, true);
    }
  );

  app.post(
    "/projects/:project/auth-connections/:clientId/enable",
    async (c) => {
      return setConnectionDisabled(c, options, authConnectionService, false);
    }
  );

  app.delete("/projects/:project/auth-connections/:clientId", async (c) => {
    const access = await requireAuthConnectionProject(
      options,
      c.req.raw.headers,
      c.req.param("project")
    );
    if (access.error) {
      return c.json({ error: access.error }, access.status);
    }
    const clientId = parseAuthConnectionId(c.req.param("clientId"));
    if (!clientId) {
      return c.json({ error: ErrorCode.InvalidOAuthClient }, 400);
    }

    try {
      await authConnectionService.delete(access.registered, clientId);
      auditConnectionChange("auth_connection.deleted", access, { clientId });
      return c.body(null, 204);
    } catch (error) {
      return authConnectionError(error);
    }
  });
};

const setConnectionDisabled = async (
  c: Context,
  options: AdminProjectLookupOptions,
  service: AuthConnectionService,
  disabled: boolean
) => {
  const access = await requireAuthConnectionProject(
    options,
    c.req.raw.headers,
    c.req.param("project") ?? ""
  );
  if (access.error) {
    return c.json({ error: access.error }, access.status);
  }
  const clientId = parseAuthConnectionId(c.req.param("clientId"));
  if (!clientId) {
    return c.json({ error: ErrorCode.InvalidOAuthClient }, 400);
  }

  try {
    const connection = await service.setDisabled(
      access.registered,
      clientId,
      disabled
    );
    auditConnectionChange(
      disabled ? "auth_connection.disabled" : "auth_connection.enabled",
      access,
      { clientId }
    );
    return c.json({ connection: authConnectionResponse(connection) });
  } catch (error) {
    return authConnectionError(error);
  }
};

const requireAuthConnectionProject = async (
  options: AdminProjectLookupOptions,
  headers: Headers,
  projectSlug: string
): Promise<AuthConnectionProjectAccess> => {
  const admin = await requireAdmin(options.registry, headers);
  if (!admin) {
    return { error: ErrorCode.Unauthorized, status: 401 };
  }
  const project = requireMutableProject(options, projectSlug);
  if (project.error) {
    return project;
  }

  return { admin, registered: project.registered };
};

const auditConnectionChange = (
  event: string,
  access: Extract<AuthConnectionProjectAccess, { admin: AdminAccess }>,
  details: { clientId: string; kind?: AuthConnectionKind }
) => {
  auditLog(event, {
    actorId: access.admin.session.user.id,
    actorEmail: access.admin.session.user.email,
    projectSlug: access.registered.project.slug,
    ...details
  });
};

const authConnectionError = (error: unknown) => {
  if (error instanceof AuthConnectionServiceError) {
    return domainErrorResponse(error);
  }

  throw error;
};
