import type { OAuthClientProfile } from "@nezdemkovski/auth-oauth-client-management";
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
  OAuthClientManagementService,
  OAuthClientManagementServiceError
} from "./core";
import {
  oauthClientCredentialResponse,
  oauthClientResponse
} from "./translator";
import {
  parseOAuthClientCreate,
  parseOAuthClientId,
  parseOAuthClientUpdate
} from "./validator";

type OAuthClientRouteContext = {
  app: Hono;
  options: AdminProjectLookupOptions;
  oauthClientManagementService: OAuthClientManagementService;
};

type AdminAccess = {
  registered: RegisteredProject;
  session: AdminSession;
};

type OAuthClientProjectAccess =
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

export const registerOAuthClientManagementRoutes = ({
  app,
  options,
  oauthClientManagementService
}: OAuthClientRouteContext) => {
  app.get("/projects/:project/oauth-clients", async (c) => {
    const access = await requireOAuthClientProject(
      options,
      c.req.raw.headers,
      c.req.param("project")
    );
    if (access.error) {
      return c.json({ error: access.error }, access.status);
    }

    try {
      const clients = await oauthClientManagementService.list(access.registered);
      return c.json({ clients: clients.map(oauthClientResponse) });
    } catch (error) {
      return oauthClientManagementError(error);
    }
  });

  app.get("/projects/:project/oauth-clients/:clientId", async (c) => {
    const access = await requireOAuthClientProject(
      options,
      c.req.raw.headers,
      c.req.param("project")
    );
    if (access.error) {
      return c.json({ error: access.error }, access.status);
    }
    const clientId = parseOAuthClientId(c.req.param("clientId"));
    if (!clientId) {
      return c.json({ error: ErrorCode.InvalidOAuthClient }, 400);
    }

    try {
      const client = await oauthClientManagementService.get(
        access.registered,
        clientId
      );
      return c.json({ client: oauthClientResponse(client) });
    } catch (error) {
      return oauthClientManagementError(error);
    }
  });

  app.post("/projects/:project/oauth-clients", async (c) => {
    const access = await requireOAuthClientProject(
      options,
      c.req.raw.headers,
      c.req.param("project")
    );
    if (access.error) {
      return c.json({ error: access.error }, access.status);
    }
    const input = parseOAuthClientCreate(await parseJson(c.req));
    if (!input) {
      return c.json({ error: ErrorCode.InvalidBody }, 400);
    }

    try {
      const created = await oauthClientManagementService.create(
        access.registered,
        input
      );
      auditClientChange("oauth_client.created", access, {
        clientId: created.client.clientId,
        profile: created.client.profile
      });
      return c.json(
        {
          client: oauthClientResponse(created.client),
          credential: oauthClientCredentialResponse(created.credential)
        },
        201
      );
    } catch (error) {
      return oauthClientManagementError(error);
    }
  });

  app.patch("/projects/:project/oauth-clients/:clientId", async (c) => {
    const access = await requireOAuthClientProject(
      options,
      c.req.raw.headers,
      c.req.param("project")
    );
    if (access.error) {
      return c.json({ error: access.error }, access.status);
    }
    const clientId = parseOAuthClientId(c.req.param("clientId"));
    const input = parseOAuthClientUpdate(await parseJson(c.req));
    if (!clientId || !input) {
      return c.json({ error: ErrorCode.InvalidBody }, 400);
    }

    try {
      const client = await oauthClientManagementService.update(
        access.registered,
        clientId,
        input
      );
      auditClientChange("oauth_client.updated", access, { clientId });
      return c.json({ client: oauthClientResponse(client) });
    } catch (error) {
      return oauthClientManagementError(error);
    }
  });

  app.post(
    "/projects/:project/oauth-clients/:clientId/rotate-secret",
    async (c) => {
      const access = await requireOAuthClientProject(
        options,
        c.req.raw.headers,
        c.req.param("project")
      );
      if (access.error) {
        return c.json({ error: access.error }, access.status);
      }
      const clientId = parseOAuthClientId(c.req.param("clientId"));
      if (!clientId) {
        return c.json({ error: ErrorCode.InvalidOAuthClient }, 400);
      }

      try {
        const credential = await oauthClientManagementService.rotateSecret(
          access.registered,
          clientId
        );
        auditClientChange("oauth_client.secret_rotated", access, { clientId });
        return c.json({
          credential: oauthClientCredentialResponse(credential)
        });
      } catch (error) {
        return oauthClientManagementError(error);
      }
    }
  );

  app.post("/projects/:project/oauth-clients/:clientId/disable", async (c) => {
    return setClientDisabled(
      c,
      options,
      oauthClientManagementService,
      true
    );
  });

  app.post("/projects/:project/oauth-clients/:clientId/enable", async (c) => {
    return setClientDisabled(
      c,
      options,
      oauthClientManagementService,
      false
    );
  });

  app.delete("/projects/:project/oauth-clients/:clientId", async (c) => {
    const access = await requireOAuthClientProject(
      options,
      c.req.raw.headers,
      c.req.param("project")
    );
    if (access.error) {
      return c.json({ error: access.error }, access.status);
    }
    const clientId = parseOAuthClientId(c.req.param("clientId"));
    if (!clientId) {
      return c.json({ error: ErrorCode.InvalidOAuthClient }, 400);
    }

    try {
      await oauthClientManagementService.delete(access.registered, clientId);
      auditClientChange("oauth_client.deleted", access, { clientId });
      return c.body(null, 204);
    } catch (error) {
      return oauthClientManagementError(error);
    }
  });
};

const setClientDisabled = async (
  c: Context,
  options: AdminProjectLookupOptions,
  service: OAuthClientManagementService,
  disabled: boolean
) => {
  const access = await requireOAuthClientProject(
    options,
    c.req.raw.headers,
    c.req.param("project") ?? ""
  );
  if (access.error) {
    return c.json({ error: access.error }, access.status);
  }
  const clientId = parseOAuthClientId(c.req.param("clientId"));
  if (!clientId) {
    return c.json({ error: ErrorCode.InvalidOAuthClient }, 400);
  }

  try {
    const client = await service.setDisabled(access.registered, clientId, disabled);
    auditClientChange(
      disabled ? "oauth_client.disabled" : "oauth_client.enabled",
      access,
      { clientId }
    );
    return c.json({ client: oauthClientResponse(client) });
  } catch (error) {
    return oauthClientManagementError(error);
  }
};

const requireOAuthClientProject = async (
  options: AdminProjectLookupOptions,
  headers: Headers,
  projectSlug: string
): Promise<OAuthClientProjectAccess> => {
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

const auditClientChange = (
  event: string,
  access: Extract<OAuthClientProjectAccess, { admin: AdminAccess }>,
  details: { clientId: string; profile?: OAuthClientProfile }
) => {
  auditLog(event, {
    actorId: access.admin.session.user.id,
    actorEmail: access.admin.session.user.email,
    projectSlug: access.registered.project.slug,
    ...details
  });
};

const oauthClientManagementError = (error: unknown) => {
  if (error instanceof OAuthClientManagementServiceError) {
    return domainErrorResponse(error);
  }

  throw error;
};
