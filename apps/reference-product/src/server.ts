import { loadReferenceProductConfig } from "./config";
import { createReferenceProductApp } from "./http/app";

const config = loadReferenceProductConfig();
const { app } = createReferenceProductApp(config);

Bun.serve({
  port: config.port,
  fetch: app.fetch
});

console.info(`Reference product listening on ${config.origin}`);
