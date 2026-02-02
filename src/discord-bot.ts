/**
 * Discord Bot Runner
 * Starts Discord bot as a separate process
 */

import { loadConfig } from "./config/index.js";
import { DiscordAdapter } from "./channels/discord.js";
import type { SystemConfig } from "./types/index.js";
import { createLogger, type LayerLogger } from "./utils/logger.js";

async function main(): Promise<void> {
  const config: SystemConfig = loadConfig();
  const logger = createLogger(config);
  const layerLogger = logger.forLayer("channel");

  // Check if Discord channel is configured
  const discordChannel = config.channels.find(c => c.type === "discord");
  if (!discordChannel || !discordChannel.enabled) {
    logger.error("Discord channel not configured or disabled");
    process.exit(1);
  }

  if (!discordChannel.token) {
    logger.error("Discord token not configured");
    logger.error("Run: moonbot channel add <id> --type discord --token <token>");
    process.exit(1);
  }

  // Create and start Discord adapter
  const bot = new DiscordAdapter(config);

  // Handle shutdown
  process.on("SIGINT", () => {
    layerLogger.info("Shutting down Discord bot...");
    bot.stop();
    process.exit(0);
  });

  await bot.start();
  layerLogger.info("Discord bot started - press Ctrl+C to stop");

  // Keep process alive
  process.stdin.resume();
}

main().catch(error => {
  const logger = createLogger();
  logger.error("Failed to start Discord bot:", { error });
  process.exit(1);
});
