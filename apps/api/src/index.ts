import { loadEnv } from "./config/env";
import { createApp } from "./http/app";
import { DIRECT_CLIENT_IP_HEADER } from "./http/security";
import { logError, logInfo } from "./runtime/logger";

const env = loadEnv();
const { app, close } = await createApp(env);

const server = Bun.serve({
  port: env.port,
  fetch(request, server) {
    const headers = new Headers(request.headers);
    const directIp = server.requestIP(request)?.address;

    if (directIp) {
      headers.set(DIRECT_CLIENT_IP_HEADER, directIp);
    } else {
      headers.delete(DIRECT_CLIENT_IP_HEADER);
    }

    return app.fetch(new Request(request, { headers }));
  }
});

logInfo("auth_service_listening", {
  url: server.url.toString()
});

const shutdown = async () => {
  await close();
  server.stop(true);
};

process.on("SIGINT", () => {
  shutdown().catch((error) => {
    logError("auth_service_shutdown_failed", {
      signal: "SIGINT",
      error: error instanceof Error ? error.message : String(error)
    });
    process.exit(1);
  });
});

process.on("SIGTERM", () => {
  shutdown().catch((error) => {
    logError("auth_service_shutdown_failed", {
      signal: "SIGTERM",
      error: error instanceof Error ? error.message : String(error)
    });
    process.exit(1);
  });
});
