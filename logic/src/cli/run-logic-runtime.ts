import { loadRuntimeConfig } from "../config/runtime-config.js";
import { createLogicRuntime } from "../runtime/logic-runtime.js";

const main = async (): Promise<void> => {
  const config = loadRuntimeConfig();
  const runtime = createLogicRuntime({ config });
  const host = process.env.INEEDABOSSAGENT_BRIDGE_HOST ?? "127.0.0.1";
  const parsedPort = Number.parseInt(process.env.INEEDABOSSAGENT_BRIDGE_PORT ?? "8787", 10);
  const port = Number.isFinite(parsedPort) ? parsedPort : 8787;

  const shutdown = async (): Promise<void> => {
    await runtime.close();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown();
  });
  process.once("SIGTERM", () => {
    void shutdown();
  });

  const listening = await runtime.listen(port, host);
  console.log(`Logic runtime listening on http://${listening.host}:${listening.port}`);
  runtime.start();
};

void main();
