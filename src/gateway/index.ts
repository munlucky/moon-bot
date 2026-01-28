// Gateway entry point

import { loadConfig, ensureStorageDirectories } from "../config/index.js";
import type { SystemConfig } from "../types/index.js";
import { GatewayServer } from "./server.js";

export { GatewayServer } from "./server.js";
export { JsonRpcServer, createRequest, createNotification } from "./json-rpc.js";

export async function startGateway(configPath?: string): Promise<GatewayServer> {
  const config: SystemConfig = loadConfig(configPath);
  ensureStorageDirectories(config);

  const gateway = new GatewayServer(config);

  const gatewayConfig = config.gateways[0];
  if (!gatewayConfig) {
    throw new Error("No gateway configuration found");
  }

  await gateway.start(gatewayConfig.port, gatewayConfig.host);
  return gateway;
}

