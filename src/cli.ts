#!/usr/bin/env node

// CLI entry point for Moonbot

import { runCli } from "./gateway/index.js";

runCli().catch((error) => {
  console.error("CLI error:", error);
  process.exit(1);
});
