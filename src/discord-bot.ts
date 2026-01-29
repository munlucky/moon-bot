/**
 * Discord Bot Runner
 * Starts Discord bot as a separate process
 */

import { loadConfig } from "./config/index.js";
import { DiscordAdapter } from "./channels/discord.js";
import type { SystemConfig } from "./types/index.js";

async function main(): Promise<void> {
  const config: SystemConfig = loadConfig();

  // Check if Discord channel is configured
  const discordChannel = config.channels.find(c => c.type === "discord");
  if (!discordChannel || !discordChannel.enabled) {
    console.error("Discord channel not configured or disabled");
    process.exit(1);
  }

  if (!discordChannel.token) {
    console.error("Discord token not configured");
    console.error("Run: moonbot channel add <id> --type discord --token <token>");
    process.exit(1);
  }

  // Create and start Discord adapter
  const bot = new DiscordAdapter(config);

  // Handle shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down Discord bot...");
    bot.stop();
    process.exit(0);
  });

  await bot.start();
  console.log("Discord bot started - press Ctrl+C to stop");

  // Keep process alive
  process.stdin.resume();
}

main().catch(error => {
  console.error("Failed to start Discord bot:", error);
  process.exit(1);
});
