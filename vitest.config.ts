import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globalSetup: "./tests/global-setup.ts",
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://unset",
      ENCRYPTION_KEY: "YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=",
      STORAGE_DRIVER: "local",
      STORAGE_LOCAL_DIR: ".data/test-storage",
      SHOPIFY_APP_URL: "https://test.example.com",
    },
  },
});
