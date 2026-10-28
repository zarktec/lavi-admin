import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://lavi:lavi@localhost:5432/lavi_test",
      JWT_SECRET: "test-secret-test-secret-test-secret-00",
      APP_ENCRYPTION_KEY: "11".repeat(32),
      CRON_SECRET: "cron-secret",
      NFC_MASTER_KEYS: "v1:000102030405060708090a0b0c0d0e0f",
      APP_DOMAIN: "app.example.com",
      SHOPIFY_API_SECRET: "shopify-secret",
      ADMIN_BASE_URL: "http://localhost:3000",
      NODE_ENV: "test",
    },
  },
});
