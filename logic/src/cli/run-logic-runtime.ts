import { loadRuntimeConfig } from "../config/runtime-config.js";
import { createLogicRuntime } from "../runtime/logic-runtime.js";

const main = async (): Promise<void> => {
  const config = loadRuntimeConfig();
  const runtime = createLogicRuntime({ config });
  const { host, port } = await runtime.listen(8787, "127.0.0.1");
  console.log(`Logic runtime listening on http://${host}:${port}`);
  runtime.start();
};

void main();
