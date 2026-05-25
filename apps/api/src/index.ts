import { loadEnv } from "./config/env";
import { createApp } from "./http/app";
import { DIRECT_CLIENT_IP_HEADER } from "./http/security";

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

console.log(`auth service listening on ${server.url}`);

const shutdown = async () => {
  await close();
  server.stop(true);
};

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
