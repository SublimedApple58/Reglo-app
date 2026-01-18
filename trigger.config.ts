import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "",
  dirs: ["trigger"],
  build: {
    // Keep Prisma external so the engine binary is shipped alongside node_modules.
    external: ["@prisma/client", "prisma"],
  },
  additionalFiles: [
    "node_modules/.prisma/client/**",
    "node_modules/.pnpm/**/.prisma/client/**",
  ],
  maxDuration: 60,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 5000,
    },
  },
});
