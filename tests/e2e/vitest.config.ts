import { defineConfig } from "vitest/config";

export default defineConfig({
  testMatch: ["**/*.spec.ts"],
  include: ["**/*.spec.ts"],
  exclude: ["**/node_modules/**", "**/dist/**"],
  testTimeout: 30000,
  pool: "forks",
  poolOptions: {
    forks: {
      singleFork: true,
    },
  },
  environment: "node",
  reporters: ["verbose"],
});
