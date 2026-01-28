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

export async function runCli(): Promise<void> {
  const args = process.argv.slice(2);

  if (args[0] === "gateway" && args[1] === "start") {
    const gateway = await startGateway();
    console.log("Gateway started. Press Ctrl+C to stop.");

    process.on("SIGINT", () => {
      console.log("\nShutting down gateway...");
      gateway.stop();
      process.exit(0);
    });
  } else if (args[0] === "gateway" && args[1] === "status") {
    const config = loadConfig();
    console.log("Gateway Configuration:");
    console.log(`  Port: ${config.gateways[0]?.port}`);
    console.log(`  Host: ${config.gateways[0]?.host}`);
    console.log(`  Agents: ${config.agents.length}`);
    console.log(`  Channels: ${config.channels.length}`);
  } else {
    console.log("Usage: moonbot gateway [start|status]");
    process.exit(1);
  }
}
