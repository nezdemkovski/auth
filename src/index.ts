import { loadEnv } from "./config/env";
import { createApp } from "./http/app";

const env = loadEnv();
const { app, registry } = await createApp(env);

const server = Bun.serve({
  port: env.port,
  fetch: app.fetch
});

console.log(`auth service listening on ${server.url}`);

const shutdown = async () => {
  await registry.close();
  server.stop(true);
};

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
