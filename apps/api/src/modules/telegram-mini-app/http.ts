import type { Hono } from "hono";

import {
  auditLog,
  parseJson,
  requireAdmin,
  requireMutableProject,
  requireRegisteredProject,
  type AdminProjectLookupOptions
} from "../../http/admin/shared";
import { ErrorCode } from "../../runtime/error-codes";
import type { TelegramMiniAppService } from "./core";
import { telegramMiniAppConnectionResponse } from "./translator";
import { parseTelegramMiniAppConnection } from "./validator";

type TelegramMiniAppRouteContext = {
  app: Hono;
  options: AdminProjectLookupOptions;
  telegramMiniAppService: TelegramMiniAppService;
};

export const registerTelegramMiniAppRoutes = ({
  app,
  options,
  telegramMiniAppService
}: TelegramMiniAppRouteContext) => {
  app.get("/projects/:project/integrations/telegram-mini-app", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: ErrorCode.Unauthorized }, 401);
    }
    const project = requireRegisteredProject(options, c.req.param("project"));
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }

    const settings = await telegramMiniAppService.read(
      project.registered.project.slug
    );
    return c.json({ connection: telegramMiniAppConnectionResponse(settings) });
  });

  app.put("/projects/:project/integrations/telegram-mini-app", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: ErrorCode.Unauthorized }, 401);
    }
    const project = requireMutableProject(options, c.req.param("project"));
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }
    const input = parseTelegramMiniAppConnection(await parseJson(c.req));
    if (!input) {
      return c.json({ error: ErrorCode.InvalidBody }, 400);
    }

    const settings = await telegramMiniAppService.connect(
      project.registered.project,
      input
    );
    auditLog("telegram_mini_app.connected", {
      actorId: admin.session.user.id,
      actorEmail: admin.session.user.email,
      projectSlug: project.registered.project.slug,
      botUsername: settings.botUsername
    });
    return c.json({ connection: telegramMiniAppConnectionResponse(settings) });
  });

  app.delete("/projects/:project/integrations/telegram-mini-app", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: ErrorCode.Unauthorized }, 401);
    }
    const project = requireMutableProject(options, c.req.param("project"));
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }

    await telegramMiniAppService.disconnect(project.registered.project);
    auditLog("telegram_mini_app.disconnected", {
      actorId: admin.session.user.id,
      actorEmail: admin.session.user.email,
      projectSlug: project.registered.project.slug
    });
    return c.body(null, 204);
  });
};
