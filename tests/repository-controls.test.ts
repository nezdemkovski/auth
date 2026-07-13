import { describe, expect, test } from "bun:test";

const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);
const read = async (path: string) => Bun.file(rootFile(path)).text();

describe("repository security controls", () => {
  test("uses one frozen workspace lockfile and keeps Drizzle on the approved release", async () => {
    const rootManifest = await Bun.file(rootFile("package.json")).json();
    const apiManifest = await Bun.file(rootFile("apps/api/package.json")).json();

    expect(await Bun.file(rootFile("bun.lock")).exists()).toBe(true);
    expect(await Bun.file(rootFile("apps/api/bun.lock")).exists()).toBe(false);
    expect(rootManifest.overrides["drizzle-orm"]).toBe("1.0.0-rc.4");
    expect(rootManifest.devDependencies["drizzle-kit"]).toBe("1.0.0-rc.4");
    expect(apiManifest.dependencies["drizzle-orm"]).toBe("1.0.0-rc.4");
    expect(await read("apps/api/Dockerfile")).toContain(
      "turbo@2.10.4 prune @nezdemkovski/auth-api --docker"
    );
  });

  test("pins external build inputs to immutable revisions", async () => {
    const workflowPaths = [
      ".github/workflows/integration-tests.yml",
      ".github/workflows/publish-helm-chart.yml",
      ".github/workflows/publish-image.yml",
      ".github/workflows/publish-sdk.yml"
    ];
    const dockerfilePaths = [
      "apps/api/Dockerfile",
      "apps/admin/Dockerfile",
      "apps/login/Dockerfile",
      "apps/router/Dockerfile"
    ];

    for (const path of workflowPaths) {
      const workflow = await read(path);
      const actionLines = workflow.split("\n").filter((line) => line.includes("uses:"));
      for (const line of actionLines) {
        expect(line).toMatch(/uses: [^\s]+@[0-9a-f]{40}(?:\s+#\s+v\d+)?$/);
      }
    }

    for (const path of dockerfilePaths) {
      const dockerfile = await read(path);
      const fromLines = dockerfile.split("\n").filter((line) => line.startsWith("FROM "));
      const localStages = new Set<string>();
      for (const line of fromLines) {
        const [, source, stageKeyword, stageName] = line.split(/\s+/);
        if (!source) {
          throw new Error(`Invalid FROM line in ${path}`);
        }
        if (!localStages.has(source)) {
          expect(source).toContain("@sha256:");
        }
        if (stageKeyword === "AS" && stageName) {
          localStages.add(stageName);
        }
      }
    }

    for (const path of dockerfilePaths.slice(1)) {
      const dockerfile = await read(path);
      expect(dockerfile).toContain(
        'CMD ["/usr/bin/caddy-unprivileged", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]'
      );
      expect(dockerfile).not.toContain("ENTRYPOINT");
    }

    expect(await read(".github/workflows/publish-image.yml")).toContain(
      "Refuse mutable release tags"
    );
  });

  test("publishes only protocol-thin integration and business contract packages", async () => {
    const contractManifest = await Bun.file(rootFile("packages/auth-contracts/package.json")).json();
    const integrationManifest = await Bun.file(rootFile("packages/auth-integration/package.json")).json();
    const apiManifest = await Bun.file(rootFile("apps/api/package.json")).json();
    const integrationIndex = await read("packages/auth-integration/src/index.ts");

    expect(await Bun.file(rootFile("packages/auth-client/package.json")).exists()).toBe(false);
    expect(await Bun.file(rootFile("packages/auth-server/package.json")).exists()).toBe(false);
    expect(integrationManifest.peerDependencies["better-auth"]).toBe("1.7.0-rc.1");
    expect(integrationManifest.dependencies).toBeUndefined();
    expect(contractManifest.files).not.toContain("dist");
    expect(contractManifest.files).not.toContain("src");
    expect(integrationManifest.files).not.toContain("dist");
    expect(integrationManifest.exports["."].bun).toBeUndefined();
    expect(contractManifest.exports["."]).toBeUndefined();
    expect(Object.keys(contractManifest.exports)).toEqual([
      "./billing",
      "./storage"
    ]);
    expect(contractManifest.exports["./billing"].bun).toBeUndefined();
    expect(contractManifest.exports["./storage"].bun).toBeUndefined();
    expect(
      await Bun.file(rootFile("packages/auth-contracts/src/index.ts")).exists()
    ).toBe(false);
    expect(
      apiManifest.dependencies["@nezdemkovski/auth-contracts"]
    ).toBeUndefined();
    expect(integrationIndex).not.toContain("fetch(");
    expect(integrationIndex).not.toContain("session");
    expect(integrationIndex).not.toContain("token");

    for (const manifest of [contractManifest, integrationManifest]) {
      expect(manifest.private).not.toBe(true);
      expect(manifest.publishConfig.access).toBe("public");
      expect(manifest.repository.url).toBe("git+https://github.com/nezdemkovski/auth.git");
    }

    const workflow = await read(".github/workflows/publish-sdk.yml");
    expect(workflow).toContain("auth-contracts-v*");
    expect(workflow).toContain("auth-integration-v*");
    expect(workflow).not.toContain("packages/auth-client");
    expect(workflow).not.toContain("packages/auth-server");
    expect(workflow).toContain("npm pack");
  });

  test("enforces an acyclic modular workspace dependency policy", async () => {
    const rootManifest = await Bun.file(rootFile("package.json")).json();
    const turbo = await Bun.file(rootFile("turbo.json")).json();
    const authRuntimeManifest = await Bun.file(
      rootFile("packages/platform/better-auth-runtime/package.json")
    ).json();
    const oauthResourceManifest = await Bun.file(
      rootFile("packages/platform/oauth-resource/package.json")
    ).json();
    const packageTags = new Map([
      ["apps/admin", "app"],
      ["apps/api", "app"],
      ["apps/login", "app"],
      ["apps/reference-product", "app"],
      ["packages/auth-contracts", "public"],
      ["packages/auth-integration", "public"],
      ["packages/client-shared", "frontend"],
      ["packages/domains/billing", "domain"],
      ["packages/domains/delivery", "domain"],
      ["packages/domains/identity", "domain"],
      ["packages/domains/observability", "domain"],
      ["packages/domains/realm", "domain"],
      ["packages/domains/storage", "domain"],
      ["packages/foundation/platform-crypto", "foundation"],
      ["packages/foundation/platform-database", "foundation"],
      ["packages/platform/better-auth-runtime", "platform"],
      ["packages/platform/oauth-resource", "platform"],
      ["packages/ui", "frontend"]
    ]);

    expect(rootManifest.scripts.boundaries).toBe("turbo boundaries");
    expect(rootManifest.scripts.test).toContain("turbo boundaries");
    expect(rootManifest.workspaces).toContain("packages/domains/*");
    expect(rootManifest.workspaces).toContain("packages/foundation/*");
    expect(turbo.boundaries.tags.domain.dependencies.allow).toEqual([
      "foundation",
      "public"
    ]);
    expect(turbo.boundaries.tags.public.dependencies.allow).toEqual(["public"]);
    expect(turbo.boundaries.tags.platform.dependencies.allow).toEqual([
      "domain",
      "foundation",
      "public"
    ]);
    expect(authRuntimeManifest.dependencies["@nezdemkovski/auth-realm"]).toBe(
      "workspace:*"
    );
    for (const capability of [
      "@nezdemkovski/auth-billing",
      "@nezdemkovski/auth-delivery",
      "@nezdemkovski/auth-observability",
      "@nezdemkovski/auth-storage"
    ]) {
      expect(authRuntimeManifest.dependencies[capability]).toBeUndefined();
    }
    expect(
      authRuntimeManifest.dependencies["@nezdemkovski/auth-oauth-resource"]
    ).toBeUndefined();
    expect(
      Object.keys(oauthResourceManifest.dependencies).filter((dependency) =>
        dependency.startsWith("@nezdemkovski/")
      )
    ).toEqual([]);

    for (const [path, tag] of packageTags) {
      const packageTurbo = await Bun.file(rootFile(`${path}/turbo.json`)).json();
      expect(packageTurbo.extends).toEqual(["//"]);
      expect(packageTurbo.tags).toEqual([tag]);
    }

    for (const path of [
      "packages/domains/billing",
      "packages/domains/delivery",
      "packages/domains/identity",
      "packages/domains/observability",
      "packages/domains/realm",
      "packages/domains/storage",
      "packages/foundation/platform-crypto",
      "packages/foundation/platform-database",
      "packages/platform/better-auth-runtime",
      "packages/platform/oauth-resource"
    ]) {
      const manifest = await Bun.file(rootFile(`${path}/package.json`)).json();
      expect(manifest.private).toBe(true);
    }
  });

  test("keeps affected CI additive to the canonical full security gate", async () => {
    const workflow = await read(".github/workflows/integration-tests.yml");

    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toContain(
      "bunx turbo run build typecheck test --affected"
    );
    expect(workflow).toContain("Run canonical full repository test suite");
    expect(workflow).toContain("run: bun run test");
  });

  test("keeps admin HTTP route dependencies capability-local", async () => {
    const sharedContext = await read("apps/api/src/http/admin/context.ts");
    const sharedExports = await read("apps/api/src/http/admin/shared.ts");
    const routePaths = [
      "apps/api/src/modules/admin-account/http.ts",
      "apps/api/src/modules/billing/http.ts",
      "apps/api/src/modules/delivery/http.ts",
      "apps/api/src/modules/observability/http.ts",
      "apps/api/src/modules/projects/http.ts",
      "apps/api/src/modules/storage/http.ts",
      "apps/api/src/modules/users/http.ts"
    ];

    expect(sharedContext).not.toContain("AdminRouteContext");
    expect(sharedContext).not.toContain("AdminRouteRegistration");
    expect(sharedExports).not.toContain("AdminRouteContext");
    expect(sharedExports).not.toContain("AdminRouteRegistration");
    for (const path of routePaths) {
      expect(await read(path)).not.toContain("AdminRouteRegistration");
    }

    expect(
      await Bun.file(
        rootFile("apps/api/src/application/admin-project-translator.ts")
      ).exists()
    ).toBe(true);
  });

  test("imports closed domain values from their owning backend packages", async () => {
    const projectConfig = await read("apps/api/src/config/projects.ts");

    for (const legacyAlias of [
      "ProjectAgentAuthMode",
      "ProjectTwoFactorRequirement",
      "DEFAULT_PROJECT_FEATURES",
      "DEFAULT_PROJECT_SOCIAL_PROVIDERS",
      "ADMIN_PROJECT_SLUG",
      "MAX_PROJECT_SLUG_LENGTH",
      "normalizeProjectSlug",
      "projectSchemaFromSlug",
      "validateProjectSlug",
      "validateProjectSchema"
    ]) {
      expect(projectConfig).not.toContain(legacyAlias);
    }

    expect(projectConfig).not.toContain("AuthUserRole");
    expect(projectConfig).toContain("type AuthProject = Realm &");
  });

  test("does not mask integration dependency health failures", async () => {
    const compose = await read("dev/docker-compose.integration.yml");

    expect(compose).not.toContain("|| exit 0");
    expect(compose).toContain("http://127.0.0.1:9000/health");
    expect(compose).toContain("postgres:17.10-alpine@sha256:");
    expect(compose).toContain("redis:8.4.0-alpine@sha256:");
    expect(compose).toContain("rustfs/rustfs:1.0.0-beta.6@sha256:");
  });

  test("keeps security and recovery documentation aligned with runtime controls", async () => {
    const envExample = await read(".env.example");
    const operations = await read("docs/OPERATIONS.md");
    const audit = await read("SECURITY_AUDIT_2026-07-09.md");
    const externalSecret = await read("charts/auth/templates/app-secret.yaml");

    expect(envExample).toContain("SECRET_ENCRYPTION_KEY=");
    expect(envExample).not.toContain("AUTH_INITIAL_ADMIN_PASSWORD");
    expect(operations).toContain("Do not replace `SECRET_ENCRYPTION_KEY` in place");
    expect(operations).toContain("generated temporary admin password");
    expect(operations).toContain("## Restore drill");
    expect(operations).toContain("networkPolicy.enabled: true");
    expect(audit).not.toContain("| open |");
    expect(externalSecret).not.toContain("AUTH_PROJECTS");
  });
});
