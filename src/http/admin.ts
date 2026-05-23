import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Hono } from "hono";
import { Polar } from "@polar-sh/sdk";
import type { PresentmentCurrency } from "@polar-sh/sdk/models/components/presentmentcurrency";
import type { Pool } from "pg";

import type { AuthRegistry } from "../auth/registry";
import type { AuthProject } from "../config/projects";
import { SOCIAL_PROVIDER_CATALOG, isSocialProviderId } from "../config/social-providers";
import { prepareProjectSchema } from "../db/bootstrap";
import {
  createProjectFromInput,
  createProjectSettings,
  normalizeProjectFeatures,
  projectSettingsExists,
  updateProjectSettings,
  type ProjectSettingsCreate,
  type ProjectSettingsPatch
} from "../db/project-settings";
import {
  loadProjectSocialProviders,
  markSocialProviderVerified,
  readProjectSocialProviders,
  socialProviderCallbackUrl,
  updateProjectSocialProvider,
  type SocialProviderPatch
} from "../db/social-provider-settings";
import {
  loadDeliverySettings,
  readPublicDeliverySettings,
  updateDeliverySettings,
  type DeliverySettingsPatch,
} from "../db/delivery-settings";
import { createEmailSender, EmailProvider, type EmailConfig } from "../email/sender";
import {
  readPublicBillingSettings,
  updateBillingSettings,
  loadProjectBillingSettings,
  type BillingSettingsPatch
} from "../db/billing-settings";

type AdminApiOptions = {
  registry: AuthRegistry;
  deliverySettings: EmailConfig;
  databaseUrl: string;
  adminProject: AuthProject;
  publicBaseUrl: string;
  secret: string;
};

type AdminSession = {
  user: {
    id: string;
    email: string;
    name: string;
    role?: string | null;
  };
  session: {
    id: string;
  };
};

type ChangePasswordBody = {
  currentPassword?: unknown;
  newPassword?: unknown;
};

type UpdateProfileBody = {
  name?: unknown;
  email?: unknown;
  currentPassword?: unknown;
};

type ResendVerificationBody = {
  email?: unknown;
};

type UpdateProjectBody = Partial<Record<keyof ProjectSettingsPatch, unknown>>;
type CreateProjectBody = Partial<Record<keyof ProjectSettingsCreate, unknown>>;
type SocialProviderBody = {
  enabled?: unknown;
  clientId?: unknown;
  clientSecret?: unknown;
};

type DeliverySettingsBody = Partial<Record<keyof DeliverySettingsPatch, unknown>>;
type BillingSettingsBody = Partial<Record<keyof BillingSettingsPatch, unknown>>;
type BillingVerifyBody = {
  accessToken?: unknown;
  environment?: unknown;
  organizationId?: unknown;
};
type CreatePolarProductBody = {
  slug?: unknown;
  name?: unknown;
  description?: unknown;
  type?: unknown;
  priceAmount?: unknown;
  priceCurrency?: unknown;
  recurringInterval?: unknown;
};

type RegisteredProject = NonNullable<ReturnType<AuthRegistry["get"]>>;

type ProjectUserRow = {
  id: string;
  email: string;
  name: string;
  role: string | null;
  banned: boolean | null;
  emailVerified: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  sessionCount: number;
};

export function createAdminApi(options: AdminApiOptions): Hono {
  const app = new Hono();
  const adminOrigin = new URL(options.publicBaseUrl).origin;
  let currentDeliverySettings = options.deliverySettings;

  app.use("*", async (c, next) => {
    if (!isStateChangingMethod(c.req.method)) {
      await next();
      return;
    }

    if (!isTrustedAdminRequest(c.req.raw.headers, adminOrigin)) {
      return c.json({ error: "forbidden_origin" }, 403);
    }

    await next();
  });

  app.get("/me", async (c) => {
    const admin = options.registry.get("admin");
    if (!admin) {
      return c.json({ error: "admin_not_configured" }, 500);
    }

    const session = await getSession(admin.auth, c.req.raw.headers);
    if (!session) {
      return c.json({ error: "unauthorized" }, 401);
    }

    return c.json({
      user: session.user,
      mustChangePassword: await mustChangePassword(admin.projectDb.pool, session.user.id),
      emailServiceEnabled: currentDeliverySettings.provider !== EmailProvider.None
    });
  });

  app.get("/delivery-settings", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    return c.json({
      settings: await readPublicDeliverySettings({
        databaseUrl: options.databaseUrl,
        adminProject: options.adminProject
      })
    });
  });

  app.patch("/delivery-settings", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const body = (await c.req.json().catch(() => ({}))) as DeliverySettingsBody;
    const patch = parseDeliverySettingsPatch(body);
    if (!patch) {
      return c.json({ error: "invalid_body" }, 400);
    }

    try {
      const settings = await updateDeliverySettings({
        databaseUrl: options.databaseUrl,
        adminProject: options.adminProject,
        encryptionSecret: options.secret,
        patch
      });
      currentDeliverySettings = await loadDeliverySettings({
        databaseUrl: options.databaseUrl,
        adminProject: options.adminProject,
        encryptionSecret: options.secret
      });
      await options.registry.updateEmailSender(createEmailSender(currentDeliverySettings));

      return c.json({ settings });
    } catch (error) {
      return c.json(
        {
          error: "invalid_delivery_settings",
          message: error instanceof Error ? error.message : "Invalid delivery settings"
        },
        400
      );
    }
  });

  app.post("/delivery-settings/verify", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const settings = await loadDeliverySettings({
      databaseUrl: options.databaseUrl,
      adminProject: options.adminProject,
      encryptionSecret: options.secret
    });
    const sender = createEmailSender(settings);
    if (!sender) {
      return c.json({ error: "delivery_not_configured" }, 409);
    }

    await sender.send({
      to: admin.session.user.email,
      subject: "Auth delivery test",
      html: "<p>Delivery settings are working.</p>",
      text: "Delivery settings are working."
    });

    return c.json({ ok: true });
  });

  app.patch("/profile", async (c) => {
    const admin = options.registry.get("admin");
    if (!admin) {
      return c.json({ error: "admin_not_configured" }, 500);
    }

    const session = await getSession(admin.auth, c.req.raw.headers);
    if (!session) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const body = (await c.req.json().catch(() => ({}))) as UpdateProfileBody;
    const patch: { name?: string; email?: string } = {};

    if (typeof body.name === "string") {
      const trimmed = body.name.trim();
      if (trimmed.length < 1 || trimmed.length > 80) {
        return c.json({ error: "invalid_name" }, 400);
      }
      patch.name = trimmed;
    }

    if (typeof body.email === "string") {
      const trimmed = body.email.trim().toLowerCase();
      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ||
        trimmed.length > 200
      ) {
        return c.json({ error: "invalid_email" }, 400);
      }
      patch.email = trimmed;
    }

    if (patch.name === undefined && patch.email === undefined) {
      return c.json({ error: "no_changes" }, 400);
    }

    try {
      if (patch.email !== undefined && patch.email !== session.user.email.toLowerCase()) {
        if (currentDeliverySettings.provider === EmailProvider.None) {
          return c.json({ error: "email_service_disabled" }, 409);
        }
        if (typeof body.currentPassword !== "string" || body.currentPassword.length === 0) {
          return c.json({ error: "current_password_required" }, 400);
        }
        if (!(await verifyPassword(admin.auth, c.req.raw.headers, body.currentPassword))) {
          return c.json({ error: "invalid_password" }, 401);
        }
      }

      await updateAdminProfile(admin.projectDb.pool, session.user.id, {
        name: patch.name
      });

      if (patch.email !== undefined && patch.email !== session.user.email.toLowerCase()) {
        await changeEmail(admin.auth, c.req.raw.headers, {
          newEmail: patch.email,
          callbackURL: `${options.publicBaseUrl}/admin/settings`
        });
      }
    } catch (error: unknown) {
      if (error instanceof Error && /unique|duplicate/i.test(error.message)) {
        return c.json({ error: "email_in_use" }, 409);
      }
      throw error;
    }

    return c.json({ ok: true });
  });

  app.post("/change-password", async (c) => {
    const admin = options.registry.get("admin");
    if (!admin) {
      return c.json({ error: "admin_not_configured" }, 500);
    }

    const session = await getSession(admin.auth, c.req.raw.headers);
    if (!session) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const body = (await c.req.json().catch(() => ({}))) as ChangePasswordBody;
    if (typeof body.currentPassword !== "string" || typeof body.newPassword !== "string") {
      return c.json({ error: "invalid_body" }, 400);
    }

    if (body.newPassword.length < 12) {
      return c.json({ error: "weak_password" }, 400);
    }

    const response = await changePassword(admin.auth, c.req.raw.headers, {
      currentPassword: body.currentPassword,
      newPassword: body.newPassword
    });

    await markPasswordChanged(admin.projectDb.pool, session.user.id);

    return c.json(response);
  });

  app.get("/projects", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const projects = await Promise.all(
      options.registry.list().map(async (project) => {
        const registered = options.registry.get(project.slug);
        if (!registered) {
          return null;
        }

        const counts = await readProjectCounts(registered.projectDb.pool);
        return serializeProject(project, counts, options.publicBaseUrl);
      })
    );

    return c.json({
      projects: projects.filter((project) => project !== null)
    });
  });

  app.post("/projects", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const body = (await c.req.json().catch(() => ({}))) as CreateProjectBody;
    const input = parseProjectCreate(body);
    if (!input) {
      return c.json({ error: "invalid_body" }, 400);
    }

    let project: AuthProject;
    try {
      project = createProjectFromInput(input);
    } catch (error) {
      return c.json(
        {
          error: "invalid_project",
          message: error instanceof Error ? error.message : "Invalid project"
        },
        400
      );
    }

    if (project.slug === options.adminProject.slug) {
      return c.json({ error: "system_project_locked" }, 409);
    }

    if (
      await projectSettingsExists({
        databaseUrl: options.databaseUrl,
        adminProject: options.adminProject,
        slug: project.slug,
        schema: project.schema
      })
    ) {
      return c.json({ error: "project_exists" }, 409);
    }

    try {
      await prepareProjectSchema({
        databaseUrl: options.databaseUrl,
        publicBaseUrl: options.publicBaseUrl,
        secret: options.secret,
        adminProject: options.adminProject,
        project
      });

      const created = await createProjectSettings({
        databaseUrl: options.databaseUrl,
        adminProject: options.adminProject,
        input
      });
      await options.registry.updateProject(created);
      const registered = options.registry.get(created.slug);
      const counts = registered ? await readProjectCounts(registered.projectDb.pool) : undefined;

      return c.json(
        {
          project: serializeProject(created, counts, options.publicBaseUrl)
        },
        201
      );
    } catch (error) {
      return c.json(
        {
          error: "create_project_failed",
          message: error instanceof Error ? error.message : "Could not create project"
        },
        400
      );
    }
  });

  app.patch("/projects/:project", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const registered = options.registry.get(c.req.param("project"));
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }

    if (registered.project.slug === options.adminProject.slug) {
      return c.json({ error: "system_project_locked" }, 409);
    }

    const body = (await c.req.json().catch(() => ({}))) as UpdateProjectBody;
    const patch = parseProjectSettingsPatch(body);
    if (!patch) {
      return c.json({ error: "invalid_body" }, 400);
    }

    try {
      const updated = await updateProjectSettings({
        databaseUrl: options.databaseUrl,
        adminProject: options.adminProject,
        slug: registered.project.slug,
        patch
      });

      if (!updated) {
        return c.json({ error: "unknown_project" }, 404);
      }

      const socialProviders = await loadProjectSocialProviders({
        databaseUrl: options.databaseUrl,
        adminProject: options.adminProject,
        project: updated,
        encryptionSecret: options.secret
      });
      const billing = await loadProjectBillingSettings({
        databaseUrl: options.databaseUrl,
        adminProject: options.adminProject,
        project: updated,
        encryptionSecret: options.secret
      });
      const nextProject = {
        ...updated,
        socialProviders,
        billing
      };
      await options.registry.updateProject(nextProject);
      const next = options.registry.get(nextProject.slug);
      const counts = next ? await readProjectCounts(next.projectDb.pool) : undefined;

      return c.json({
        project: serializeProject(nextProject, counts, options.publicBaseUrl)
      });
    } catch (error) {
      return c.json(
        {
          error: "invalid_project_settings",
          message: error instanceof Error ? error.message : "Invalid project settings"
        },
        400
      );
    }
  });

  app.get("/projects/:project/social-providers", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const registered = options.registry.get(c.req.param("project"));
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }

    return c.json({
      providers: await readProjectSocialProviders({
        databaseUrl: options.databaseUrl,
        adminProject: options.adminProject,
        project: registered.project,
        publicBaseUrl: options.publicBaseUrl
      }),
      catalog: Object.values(SOCIAL_PROVIDER_CATALOG)
    });
  });

  app.patch("/projects/:project/social-providers/:provider", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const registered = options.registry.get(c.req.param("project"));
    const provider = c.req.param("provider");
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }
    if (!isSocialProviderId(provider)) {
      return c.json({ error: "unknown_provider" }, 404);
    }

    const body = (await c.req.json().catch(() => ({}))) as SocialProviderBody;
    const patch = parseSocialProviderPatch(body);
    if (!patch) {
      return c.json({ error: "invalid_body" }, 400);
    }

    const socialProviders = await updateProjectSocialProvider({
      databaseUrl: options.databaseUrl,
      adminProject: options.adminProject,
      project: registered.project,
      provider,
      patch,
      encryptionSecret: options.secret
    });
    await options.registry.updateProject({
      ...registered.project,
      socialProviders
    });

    return c.json({
      providers: await readProjectSocialProviders({
        databaseUrl: options.databaseUrl,
        adminProject: options.adminProject,
        project: registered.project,
        publicBaseUrl: options.publicBaseUrl
      }),
      catalog: Object.values(SOCIAL_PROVIDER_CATALOG)
    });
  });

  app.post("/projects/:project/social-providers/:provider/verify", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const registered = options.registry.get(c.req.param("project"));
    const provider = c.req.param("provider");
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }
    if (!isSocialProviderId(provider)) {
      return c.json({ error: "unknown_provider" }, 404);
    }

    const settings = registered.project.socialProviders[provider];
    if (!settings.enabled || !settings.clientId || !settings.clientSecret) {
      return c.json({ error: "provider_not_configured" }, 409);
    }

    const api = registered.auth.api as unknown as {
      signInSocial(input: {
        body: {
          provider: string;
          callbackURL: string;
          errorCallbackURL: string;
          disableRedirect: boolean;
        };
        headers: Headers;
      }): Promise<{ url?: string; redirect: boolean }>;
    };
    const callbackURL = registered.project.trustedOrigins[0] ?? options.publicBaseUrl;
    const result = await api.signInSocial({
      body: {
        provider,
        callbackURL,
        errorCallbackURL: callbackURL,
        disableRedirect: true
      },
      headers: c.req.raw.headers
    });

    if (!result.url) {
      return c.json({ error: "provider_check_failed" }, 409);
    }

    await markSocialProviderVerified({
      databaseUrl: options.databaseUrl,
      adminProject: options.adminProject,
      project: registered.project,
      provider
    });
    const socialProviders = await loadProjectSocialProviders({
      databaseUrl: options.databaseUrl,
      adminProject: options.adminProject,
      project: registered.project,
      encryptionSecret: options.secret
    });
    await options.registry.updateProject({
      ...registered.project,
      socialProviders
    });

    return c.json({
      ok: true,
      providers: await readProjectSocialProviders({
        databaseUrl: options.databaseUrl,
        adminProject: options.adminProject,
        project: registered.project,
        publicBaseUrl: options.publicBaseUrl
      }),
      catalog: Object.values(SOCIAL_PROVIDER_CATALOG)
    });
  });

  app.get("/projects/:project/billing", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const registered = options.registry.get(c.req.param("project"));
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }

    return c.json({
      settings: await readPublicBillingSettings({
        databaseUrl: options.databaseUrl,
        adminProject: options.adminProject,
        project: registered.project,
        publicBaseUrl: options.publicBaseUrl
      })
    });
  });

  app.patch("/projects/:project/billing", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const registered = options.registry.get(c.req.param("project"));
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }
    if (registered.project.slug === options.adminProject.slug) {
      return c.json({ error: "system_project_locked" }, 409);
    }

    const body = (await c.req.json().catch(() => ({}))) as BillingSettingsBody;
    const patch = parseBillingSettingsPatch(body);
    if (!patch) {
      return c.json({ error: "invalid_body" }, 400);
    }

    try {
      const billing = await updateBillingSettings({
        databaseUrl: options.databaseUrl,
        adminProject: options.adminProject,
        project: registered.project,
        encryptionSecret: options.secret,
        patch
      });
      await options.registry.updateProject({
        ...registered.project,
        billing
      });

      return c.json({
        settings: await readPublicBillingSettings({
          databaseUrl: options.databaseUrl,
          adminProject: options.adminProject,
          project: registered.project,
          publicBaseUrl: options.publicBaseUrl
        })
      });
    } catch (error) {
      return c.json(
        {
          error: "invalid_billing_settings",
          message: error instanceof Error ? error.message : "Invalid billing settings"
        },
        400
      );
    }
  });

  app.post("/projects/:project/billing/verify", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const registered = options.registry.get(c.req.param("project"));
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }

    const body = (await c.req.json().catch(() => ({}))) as BillingVerifyBody;
    const billing = registered.project.billing;
    const accessToken =
      typeof body.accessToken === "string" && body.accessToken.trim()
        ? body.accessToken.trim()
        : billing.accessToken;
    const environment =
      body.environment === "production" || body.environment === "sandbox"
        ? body.environment
        : billing.environment;
    const organizationId =
      typeof body.organizationId === "string"
        ? body.organizationId.trim()
        : billing.organizationId;

    if (!accessToken) {
      return c.json({ error: "billing_not_configured" }, 409);
    }

    const client = new Polar({
      accessToken,
      server: environment
    });
    try {
      await client.products.list({
        organizationId: organizationId || undefined,
        limit: 1
      });
    } catch (error) {
      const environmentHint = await polarEnvironmentMismatchMessage(
        error,
        accessToken,
        environment,
        organizationId
      );
      return c.json(
        {
          error: "polar_check_failed",
          message: environmentHint ?? polarErrorMessage(error, "Polar check failed")
        },
        400
      );
    }

    return c.json({ ok: true });
  });

  app.get("/projects/:project/billing/polar-products", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const registered = options.registry.get(c.req.param("project"));
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }

    const client = createPolarClient(registered.project);
    if (!client) {
      return c.json(
        {
          error: "billing_not_configured",
          message: "Enable Polar billing and save an access token before loading products"
        },
        409
      );
    }

    try {
      const page = await client.products.list({
        organizationId: registered.project.billing.organizationId || undefined,
        isArchived: false,
        limit: 50
      });

      return c.json({
        products: page.result.items.map((product) => ({
          id: product.id,
          name: product.name,
          description: product.description ?? "",
          isRecurring: product.isRecurring,
          isArchived: product.isArchived,
          organizationId: product.organizationId
        }))
      });
    } catch (error) {
      const environmentHint = await polarEnvironmentMismatchMessage(
        error,
        registered.project.billing.accessToken,
        registered.project.billing.environment,
        registered.project.billing.organizationId
      );
      return c.json(
        {
          error: "polar_products_failed",
          message: environmentHint ?? polarErrorMessage(error, "Could not load Polar products")
        },
        400
      );
    }
  });

  app.post("/projects/:project/billing/polar-products", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const registered = options.registry.get(c.req.param("project"));
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }
    if (registered.project.slug === options.adminProject.slug) {
      return c.json({ error: "system_project_locked" }, 409);
    }

    const client = createPolarClient(registered.project);
    if (!client) {
      return c.json(
        {
          error: "billing_not_configured",
          message: "Enable Polar billing and save an access token before creating products"
        },
        409
      );
    }

    const body = (await c.req.json().catch(() => ({}))) as CreatePolarProductBody;
    const input = parseCreatePolarProduct(body);
    if (!input) {
      return c.json({ error: "invalid_body" }, 400);
    }

    try {
      const product = await client.products.create({
        name: input.name,
        description: input.description || null,
        organizationId: registered.project.billing.organizationId || undefined,
        visibility: "private",
        prices: [
          {
            amountType: "fixed",
            priceAmount: input.priceAmount,
            priceCurrency: input.priceCurrency as PresentmentCurrency
          }
        ],
        ...(input.type === "subscription"
          ? {
              recurringInterval: input.recurringInterval,
              recurringIntervalCount: 1
            }
          : {
              recurringInterval: null,
              recurringIntervalCount: null
            })
      });

      return c.json(
        {
          product: {
            slug: input.slug,
            name: product.name,
            description: product.description ?? "",
            productId: product.id,
            type: input.type,
            active: true,
            entitlements: defaultEntitlementsForBillingProduct(input.type)
          }
        },
        201
      );
    } catch (error) {
      const environmentHint = await polarEnvironmentMismatchMessage(
        error,
        registered.project.billing.accessToken,
        registered.project.billing.environment,
        registered.project.billing.organizationId
      );
      return c.json(
        {
          error: "polar_product_create_failed",
          message: environmentHint ?? polarErrorMessage(error, "Could not create Polar product")
        },
        400
      );
    }
  });

  app.get("/projects/:project/users", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const registered = options.registry.get(c.req.param("project"));
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }

    const users = await readProjectUsers(registered.projectDb.pool);

    return c.json({
      project: {
        slug: registered.project.slug,
        name: registered.project.name,
        schema: registered.project.schema,
        description: registered.project.description,
        iconUrl: registered.project.iconUrl,
        appUrl: registered.project.appUrl,
        trustedOrigins: registered.project.trustedOrigins,
        system: registered.project.slug === options.adminProject.slug
      },
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        banned: user.banned ?? false,
        emailVerified: user.emailVerified,
        createdAt: toIsoString(user.createdAt),
        updatedAt: toIsoString(user.updatedAt),
        sessionCount: Number(user.sessionCount)
      }))
    });
  });

  app.post("/projects/:project/users/:userId/terminate-sessions", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const registered = options.registry.get(c.req.param("project"));
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }

    const userId = c.req.param("userId");
    const terminated = await terminateUserSessions(registered.projectDb.pool, userId);

    return c.json({
      terminated
    });
  });

  app.post("/projects/:project/users/resend-verification", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    if (currentDeliverySettings.provider === EmailProvider.None) {
      return c.json({ error: "email_service_disabled" }, 409);
    }

    const registered = options.registry.get(c.req.param("project"));
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }

    const body = (await c.req.json().catch(() => ({}))) as ResendVerificationBody;
    if (typeof body.email !== "string") {
      return c.json({ error: "invalid_body" }, 400);
    }

    await sendVerificationEmail(registered.auth, {
      email: body.email,
      callbackURL: registered.project.trustedOrigins[0]
    });

    return c.json({ ok: true });
  });

  return app;
}

function serializeProject(
  project: AuthProject,
  counts: { userCount: number; activeSessionCount: number } = {
    userCount: 0,
    activeSessionCount: 0
  },
  publicBaseUrl = ""
) {
  return {
    slug: project.slug,
    name: project.name,
    schema: project.schema,
    description: project.description,
    iconUrl: project.iconUrl,
    appUrl: project.appUrl,
    trustedOrigins: project.trustedOrigins,
    features: project.features,
    socialProviders: Object.values(SOCIAL_PROVIDER_CATALOG).map((provider) => {
      const settings = project.socialProviders[provider.id];
      return {
        provider: provider.id,
        enabled: settings.enabled,
        clientId: settings.clientId,
        configured: Boolean(settings.clientId && settings.clientSecret),
        verifiedAt: settings.verifiedAt,
        callbackUrl: socialProviderCallbackUrl(publicBaseUrl, project, provider.id)
      };
    }),
    system: project.slug === "admin",
    ...counts
  };
}

function parseProjectCreate(body: CreateProjectBody): ProjectSettingsCreate | null {
  if (
    typeof body.slug !== "string" ||
    typeof body.name !== "string" ||
    typeof body.description !== "string" ||
    typeof body.iconUrl !== "string" ||
    typeof body.appUrl !== "string" ||
    !Array.isArray(body.trustedOrigins) ||
    !body.trustedOrigins.every((origin) => typeof origin === "string")
  ) {
    return null;
  }

  return {
    slug: body.slug.trim(),
    name: body.name.trim(),
    description: body.description.trim(),
    iconUrl: body.iconUrl.trim(),
    appUrl: body.appUrl.trim(),
    trustedOrigins: body.trustedOrigins.map((origin) => origin.trim()).filter(Boolean),
    features: normalizeProjectFeatures(body.features)
  };
}

function parseProjectSettingsPatch(body: UpdateProjectBody): ProjectSettingsPatch | null {
  if (
    typeof body.name !== "string" ||
    typeof body.description !== "string" ||
    typeof body.iconUrl !== "string" ||
    typeof body.appUrl !== "string" ||
    !Array.isArray(body.trustedOrigins) ||
    !body.trustedOrigins.every((origin) => typeof origin === "string")
  ) {
    return null;
  }

  return {
    name: body.name.trim(),
    description: body.description.trim(),
    iconUrl: body.iconUrl.trim(),
    appUrl: body.appUrl.trim(),
    trustedOrigins: body.trustedOrigins.map((origin) => origin.trim()).filter(Boolean),
    features: normalizeProjectFeatures(body.features)
  };
}

function parseSocialProviderPatch(body: SocialProviderBody): SocialProviderPatch | null {
  if (typeof body.enabled !== "boolean" || typeof body.clientId !== "string") {
    return null;
  }

  const patch: SocialProviderPatch = {
    enabled: body.enabled,
    clientId: body.clientId.trim()
  };

  if (typeof body.clientSecret === "string" && body.clientSecret.trim().length > 0) {
    patch.clientSecret = body.clientSecret.trim();
  }

  return patch;
}

function parseDeliverySettingsPatch(body: DeliverySettingsBody): DeliverySettingsPatch | null {
  if (
    typeof body.provider !== "string" ||
    typeof body.from !== "string" ||
    typeof body.cloudflareAccountId !== "string"
  ) {
    return null;
  }

  const patch: DeliverySettingsPatch = {
    provider: body.provider as DeliverySettingsPatch["provider"],
    from: body.from.trim(),
    cloudflareAccountId: body.cloudflareAccountId.trim()
  };

  if (typeof body.cloudflareApiToken === "string" && body.cloudflareApiToken.trim()) {
    patch.cloudflareApiToken = body.cloudflareApiToken.trim();
  }
  if (typeof body.resendApiKey === "string" && body.resendApiKey.trim()) {
    patch.resendApiKey = body.resendApiKey.trim();
  }

  return patch;
}

function parseBillingSettingsPatch(body: BillingSettingsBody): BillingSettingsPatch | null {
  if (
    typeof body.provider !== "string" ||
    typeof body.enabled !== "boolean" ||
    typeof body.environment !== "string" ||
    typeof body.organizationId !== "string" ||
    !Array.isArray(body.products)
  ) {
    return null;
  }

  const products = body.products
    .filter(isRecord)
    .map((product) => {
      if (
        typeof product.slug !== "string" ||
        typeof product.name !== "string" ||
        typeof product.description !== "string" ||
        typeof product.productId !== "string" ||
        typeof product.type !== "string" ||
        typeof product.active !== "boolean" ||
        !Array.isArray(product.entitlements)
      ) {
        return null;
      }

      const entitlements = product.entitlements
        .filter(isRecord)
        .map((entitlement) => {
          if (
            typeof entitlement.key !== "string" ||
            typeof entitlement.grantType !== "string" ||
            typeof entitlement.resetPeriod !== "string" ||
            typeof entitlement.priority !== "number"
          ) {
            return null;
          }

          return {
            key: entitlement.key.trim(),
            grantType: entitlement.grantType as BillingSettingsPatch["products"][number]["entitlements"][number]["grantType"],
            amount:
              typeof entitlement.amount === "number" && Number.isFinite(entitlement.amount)
                ? entitlement.amount
                : null,
            resetPeriod: entitlement.resetPeriod as BillingSettingsPatch["products"][number]["entitlements"][number]["resetPeriod"],
            priority: entitlement.priority
          };
        })
        .filter((entitlement) => entitlement !== null);

      return {
        slug: product.slug.trim(),
        name: product.name.trim(),
        description: product.description.trim(),
        productId: product.productId.trim(),
        type: product.type as BillingSettingsPatch["products"][number]["type"],
        active: product.active,
        entitlements
      };
    })
    .filter((product) => product !== null);

  const patch: BillingSettingsPatch = {
    provider: body.provider as BillingSettingsPatch["provider"],
    enabled: body.enabled,
    environment: body.environment as BillingSettingsPatch["environment"],
    organizationId: body.organizationId.trim(),
    products
  };

  if (typeof body.accessToken === "string" && body.accessToken.trim()) {
    patch.accessToken = body.accessToken.trim();
  }
  if (typeof body.webhookSecret === "string" && body.webhookSecret.trim()) {
    patch.webhookSecret = body.webhookSecret.trim();
  }

  return patch;
}

function parseCreatePolarProduct(body: CreatePolarProductBody): {
  slug: string;
  name: string;
  description: string;
  type: "subscription" | "one_time" | "credit_pack" | "lifetime";
  priceAmount: number;
  priceCurrency: string;
  recurringInterval: "month" | "year";
} | null {
  if (
    typeof body.slug !== "string" ||
    typeof body.name !== "string" ||
    typeof body.description !== "string" ||
    typeof body.type !== "string" ||
    typeof body.priceAmount !== "number" ||
    typeof body.priceCurrency !== "string" ||
    typeof body.recurringInterval !== "string"
  ) {
    return null;
  }

  const slug = body.slug.trim();
  const name = body.name.trim();
  const priceCurrency = body.priceCurrency.trim().toLowerCase();
  const type =
    body.type === "subscription" ||
    body.type === "one_time" ||
    body.type === "credit_pack" ||
    body.type === "lifetime"
      ? body.type
      : null;
  const recurringInterval =
    body.recurringInterval === "year" || body.recurringInterval === "month"
      ? body.recurringInterval
      : null;

  if (
    !type ||
    !recurringInterval ||
    !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) ||
    name.length === 0 ||
    priceCurrency.length !== 3 ||
    !Number.isFinite(body.priceAmount) ||
    body.priceAmount < 50
  ) {
    return null;
  }

  return {
    slug,
    name,
    description: body.description.trim(),
    type,
    priceAmount: Math.round(body.priceAmount),
    priceCurrency,
    recurringInterval
  };
}

function createPolarClient(project: AuthProject): Polar | null {
  const billing = project.billing;
  if (billing.provider !== "polar" || !billing.enabled || !billing.accessToken) {
    return null;
  }

  return new Polar({
    accessToken: billing.accessToken,
    server: billing.environment
  });
}

function defaultEntitlementsForBillingProduct(
  type: "subscription" | "one_time" | "credit_pack" | "lifetime"
): BillingSettingsPatch["products"][number]["entitlements"] {
  if (type === "subscription") {
    return [
      {
        key: "ai_requests",
        grantType: "recurring_quota",
        amount: 100,
        resetPeriod: "monthly",
        priority: 100
      }
    ];
  }
  if (type === "credit_pack") {
    return [
      {
        key: "ai_request_credits",
        grantType: "one_time_credits",
        amount: 100,
        resetPeriod: "never",
        priority: 100
      }
    ];
  }

  return [
    {
      key: "access",
      grantType: type === "lifetime" ? "lifetime" : "boolean",
      amount: null,
      resetPeriod: "never",
      priority: 100
    }
  ];
}

function polarErrorMessage(error: unknown, fallback: string): string {
  if (isRecord(error)) {
    const body = typeof error.body === "string" ? error.body : "";
    const statusCode = typeof error.statusCode === "number" ? error.statusCode : null;
    const parsed = parsePolarErrorBody(body);
    if (parsed) {
      return statusCode ? `Polar ${statusCode}: ${parsed}` : parsed;
    }
    if (error.message && typeof error.message === "string") {
      return statusCode ? `Polar ${statusCode}: ${error.message}` : error.message;
    }
  }

  return error instanceof Error ? error.message : fallback;
}

async function polarEnvironmentMismatchMessage(
  error: unknown,
  accessToken: string,
  environment: "sandbox" | "production",
  organizationId: string
): Promise<string | null> {
  if (!accessToken || !isPolarInvalidTokenError(error)) {
    return null;
  }

  const oppositeEnvironment = environment === "sandbox" ? "production" : "sandbox";
  const client = new Polar({
    accessToken,
    server: oppositeEnvironment
  });

  try {
    await client.products.list({
      organizationId: organizationId || undefined,
      limit: 1
    });
  } catch {
    return null;
  }

  return `Polar token is valid for ${oppositeEnvironment}, but this realm is set to ${environment}. Switch the billing environment to ${oppositeEnvironment} or create an Organization Access Token in ${environment}.`;
}

function isPolarInvalidTokenError(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }

  const body = typeof error.body === "string" ? error.body : "";
  if (!body) {
    return false;
  }

  try {
    const data = JSON.parse(body) as unknown;
    return isRecord(data) && data.error === "invalid_token";
  } catch {
    return body.includes("invalid_token");
  }
}

function parsePolarErrorBody(body: string): string | null {
  if (!body) {
    return null;
  }

  try {
    const data = JSON.parse(body) as unknown;
    if (!isRecord(data)) {
      return body.slice(0, 300);
    }
    if (typeof data.detail === "string") {
      return data.detail;
    }
    if (Array.isArray(data.detail)) {
      return data.detail
        .map((item) => {
          if (!isRecord(item)) {
            return null;
          }
          const location = Array.isArray(item.loc) ? item.loc.join(".") : "";
          const message = typeof item.msg === "string" ? item.msg : null;
          return message ? [location, message].filter(Boolean).join(": ") : null;
        })
        .filter((item): item is string => Boolean(item))
        .join("; ");
    }
    if (typeof data.message === "string") {
      return data.message;
    }
    return JSON.stringify(data).slice(0, 300);
  } catch {
    return body.slice(0, 300);
  }
}

function isStateChangingMethod(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

function isTrustedAdminRequest(headers: Headers, adminOrigin: string): boolean {
  const origin = headers.get("origin");
  if (origin) {
    return origin === adminOrigin;
  }

  const secFetchSite = headers.get("sec-fetch-site");
  if (secFetchSite) {
    return secFetchSite === "same-origin";
  }

  return false;
}

async function requireAdmin(
  registry: AuthRegistry,
  headers: Headers
): Promise<{ registered: RegisteredProject; session: AdminSession } | null> {
  const registered = registry.get("admin");
  if (!registered) {
    return null;
  }

  const session = await getSession(registered.auth, headers);
  if (!session || session.user.role !== "admin") {
    return null;
  }

  return {
    registered,
    session
  };
}

async function getSession(auth: unknown, headers: Headers): Promise<AdminSession | null> {
  const api = (auth as {
    api: {
      getSession(input: { headers: Headers }): Promise<AdminSession | null>;
    };
  }).api;

  return api.getSession({ headers });
}

async function changePassword(
  auth: unknown,
  headers: Headers,
  body: {
    currentPassword: string;
    newPassword: string;
  }
): Promise<unknown> {
  const api = (auth as {
    api: {
      changePassword(input: {
        headers: Headers;
        body: {
          currentPassword: string;
          newPassword: string;
          revokeOtherSessions: boolean;
        };
      }): Promise<unknown>;
    };
  }).api;

  return api.changePassword({
    headers,
    body: {
      ...body,
      revokeOtherSessions: true
    }
  });
}

async function verifyPassword(
  auth: unknown,
  headers: Headers,
  password: string
): Promise<boolean> {
  const api = (auth as {
    api: {
      verifyPassword(input: {
        headers: Headers;
        body: {
          password: string;
        };
      }): Promise<{ status: boolean }>;
    };
  }).api;

  const result = await api
    .verifyPassword({
      headers,
      body: {
        password
      }
    })
    .catch(() => null);

  return result?.status === true;
}

async function changeEmail(
  auth: unknown,
  headers: Headers,
  body: {
    newEmail: string;
    callbackURL: string;
  }
): Promise<unknown> {
  const api = (auth as {
    api: {
      changeEmail(input: {
        headers: Headers;
        body: {
          newEmail: string;
          callbackURL: string;
        };
      }): Promise<unknown>;
    };
  }).api;

  return api.changeEmail({
    headers,
    body
  });
}

async function sendVerificationEmail(
  auth: unknown,
  body: {
    email: string;
    callbackURL?: string;
  }
): Promise<unknown> {
  const api = (auth as {
    api: {
      sendVerificationEmail(input: {
        body: {
          email: string;
          callbackURL?: string;
        };
      }): Promise<unknown>;
    };
  }).api;

  return api.sendVerificationEmail({ body });
}

async function mustChangePassword(pool: Pool, userId: string): Promise<boolean> {
  const db = drizzle({ client: pool });
  const result = await db.execute<{ must_change_password: boolean }>(sql`
    SELECT must_change_password
    FROM auth_bootstrap_state
    WHERE key = 'initial_admin'
      AND user_id = ${userId}
    LIMIT 1
  `);

  return result.rows[0]?.must_change_password ?? false;
}

async function updateAdminProfile(
  pool: Pool,
  userId: string,
  patch: { name?: string; email?: string }
): Promise<void> {
  const db = drizzle({ client: pool });

  if (patch.name !== undefined && patch.email !== undefined) {
    await db.execute(sql`
      UPDATE "user"
      SET name = ${patch.name},
          email = ${patch.email},
          "updatedAt" = now()
      WHERE id = ${userId}
    `);
    return;
  }
  if (patch.name !== undefined) {
    await db.execute(sql`
      UPDATE "user"
      SET name = ${patch.name},
          "updatedAt" = now()
      WHERE id = ${userId}
    `);
    return;
  }
  if (patch.email !== undefined) {
    await db.execute(sql`
      UPDATE "user"
      SET email = ${patch.email},
          "updatedAt" = now()
      WHERE id = ${userId}
    `);
  }
}

async function markPasswordChanged(pool: Pool, userId: string): Promise<void> {
  const db = drizzle({ client: pool });

  await db.execute(sql`
    UPDATE auth_bootstrap_state
    SET must_change_password = false,
        changed_at = now()
    WHERE key = 'initial_admin'
      AND user_id = ${userId}
  `);
}

async function readProjectCounts(pool: Pool): Promise<{
  userCount: number;
  activeSessionCount: number;
}> {
  const db = drizzle({ client: pool });
  const result = await db.execute<{
    userCount: string;
    activeSessionCount: string;
  }>(sql`
    SELECT (SELECT COUNT(*)::int FROM "user") AS "userCount",
           (SELECT COUNT(*)::int FROM "session" WHERE "expiresAt" > now()) AS "activeSessionCount"
  `);

  return {
    userCount: Number(result.rows[0]?.userCount ?? 0),
    activeSessionCount: Number(result.rows[0]?.activeSessionCount ?? 0)
  };
}

async function readProjectUsers(pool: Pool): Promise<ProjectUserRow[]> {
  const db = drizzle({ client: pool });
  const result = await db.execute<ProjectUserRow>(sql`
    SELECT u.id,
           u.email,
           u.name,
           u.role,
           u.banned,
           u."emailVerified",
           u."createdAt",
           u."updatedAt",
           COUNT(s.id)::int AS "sessionCount"
    FROM "user" u
    LEFT JOIN "session" s ON s."userId" = u.id AND s."expiresAt" > now()
    GROUP BY u.id
    ORDER BY u."createdAt" DESC
    LIMIT 100
  `);

  return result.rows;
}

async function terminateUserSessions(pool: Pool, userId: string): Promise<number> {
  const db = drizzle({ client: pool });
  const result = await db.execute<{ id: string }>(sql`
    DELETE FROM "session"
    WHERE "userId" = ${userId}
      AND "expiresAt" > now()
    RETURNING id
  `);

  return result.rows.length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export const __adminTestUtils = {
  isPolarInvalidTokenError,
  isTrustedAdminRequest
};
