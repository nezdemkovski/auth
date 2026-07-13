import {
  ObservabilityComponent,
  ObservabilityServiceError,
  parseObservabilitySettingsPatch
} from "@nezdemkovski/auth-observability";

import {
  auditLog,
  domainErrorResponse,
  parseJson,
  requireAdmin,
  type AdminRouteRegistration
} from "../../http/admin/shared";
import { ErrorCode } from "../../runtime/error-codes";

export const registerObservabilityRoutes: AdminRouteRegistration = ({
  app,
  options,
  observabilityService
}) => {
  app.get("/observability-config", (c) => {
    return c.json({
      observability: observabilityService.publicConfig()
    });
  });

  app.get("/observability-settings", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: ErrorCode.Unauthorized }, 401);
    }

    return c.json({
      settings: await observabilityService.readSettings()
    });
  });

  app.patch("/observability-settings", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: ErrorCode.Unauthorized }, 401);
    }

    const patch = parseObservabilitySettingsPatch(await parseJson(c.req));
    if (!patch) {
      return c.json({ error: ErrorCode.InvalidBody }, 400);
    }

    try {
      const settings = await observabilityService.updateSettings(patch);
      auditLog("observability.settings.updated", {
        actorId: admin.session.user.id,
        actorEmail: admin.session.user.email
      });
      return c.json({ settings });
    } catch (error) {
      return observabilityServiceError(error);
    }
  });

  app.post("/observability-settings/test", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: ErrorCode.Unauthorized }, 401);
    }

    try {
      await observabilityService.sendTestEvent();
      auditLog("observability.test_event.sent", {
        actorId: admin.session.user.id,
        actorEmail: admin.session.user.email
      });
      return c.json({ ok: true });
    } catch (error) {
      return observabilityServiceError(error);
    }
  });
};

const observabilityServiceError = (error: unknown) => {
  if (error instanceof ObservabilityServiceError) {
    return domainErrorResponse(error);
  }

  throw error;
};

export const inferObservabilityContext = (request: Request) => {
  const url = new URL(request.url);
  const path = url.pathname;
  return {
    component: ObservabilityComponent.Api,
    method: request.method,
    path: normalizePath(path),
    projectSlug: projectSlugFromPath(path),
    routeArea: routeAreaFromPath(path)
  };
};

const projectSlugFromPath = (path: string) => {
  const match = path.match(/^\/api\/([^/]+)\//);
  return match?.[1];
};

const routeAreaFromPath = (path: string) => {
  if (path.startsWith("/admin/api")) return "admin";
  if (/^\/api\/[^/]+\/login\//.test(path)) return "login";
  if (/^\/api\/[^/]+\/auth\//.test(path)) return "auth-proxy";
  if (/^\/api\/[^/]+\/storage\//.test(path)) return "storage";
  return "platform";
};

const normalizePath = (path: string) => {
  return path.replace(/^\/api\/[^/]+\//, "/api/:project/");
};
