// Channel adapters entry point

import type { SystemConfig } from "../types/index.js";
import { DiscordAdapter } from "./discord.js";

export { DiscordAdapter } from "./discord.js";

export function createChannel(type: "discord" | "slack" | "telegram", config: SystemConfig) {
  switch (type) {
    case "discord":
      return new DiscordAdapter(config);
    default:
      throw new Error(`Unsupported channel type: ${type}`);
  }
}
