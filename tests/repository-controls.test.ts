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
    expect(await read("apps/api/Dockerfile")).toContain("COPY package.json bun.lock ./");
  });

  test("pins external build inputs to immutable revisions", async () => {
    const workflowPaths = [
      ".github/workflows/integration-tests.yml",
      ".github/workflows/publish-helm-chart.yml",
      ".github/workflows/publish-image.yml"
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
      for (const line of fromLines) {
        expect(line).toContain("@sha256:");
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

  test("renders migration, health, secret reload, and pod hardening controls", () => {
    const result = Bun.spawnSync([
      "helm",
      "template",
      "auth",
      "charts/auth",
      "--namespace",
      "auth",
      "--set",
      "objectStorage.enabled=true"
    ]);
    const rendered = result.stdout.toString();

    expect(result.exitCode).toBe(0);
    expect(rendered).toContain("name: auth-api-migrate");
    expect(rendered).toContain("AUTH_AUTO_MIGRATE");
    expect(rendered).toContain('value: "false"');
    expect(rendered).toContain("path: /livez");
    expect(rendered).toContain("path: /readyz");
    expect(rendered).toContain("@health path /healthz /livez /readyz");
    expect(rendered).toContain("header_up X-Auth-Client-IP {client_ip}");
    expect(rendered).toContain("ghcr.io/nezdemkovski/auth-router:v0.1.81");
    expect(rendered).not.toContain("cp /usr/bin/caddy /runtime/caddy");
    expect(rendered).toContain('reloader.stakater.com/auto: "true"');
    expect(rendered).toContain("kind: NetworkPolicy");
    expect(rendered).toContain("name: auth-default-deny");
    expect(rendered.match(/automountServiceAccountToken: false/g)?.length).toBe(8);
    expect(rendered).not.toContain("allowPrivilegeEscalation: true");
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
