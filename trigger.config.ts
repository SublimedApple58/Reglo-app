import { execSync } from "node:child_process";
import { defineConfig } from "@trigger.dev/sdk/v3";

const prismaGenerateExtension = {
  name: "prisma-generate",
  onBuildStart: () => {
    execSync("npx prisma generate", { stdio: "inherit" });
  },
};

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "",
  dirs: ["trigger"],
  tsconfig: "./tsconfig.json",
  build: {
    // Keep Prisma external so the engine binary is shipped alongside node_modules.
    external: ["@prisma/client", "prisma"],
    extensions: [prismaGenerateExtension],
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
