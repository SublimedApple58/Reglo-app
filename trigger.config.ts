import { execSync } from "node:child_process";
import { defineConfig } from "@trigger.dev/sdk/v3";

const prismaGenerateExtension = {
  name: "prisma-generate",
  onBuildStart: () => {
    const rootDir = process.cwd();
    console.log("[trigger] Running prisma generate...");
    execSync("rm -rf node_modules/.prisma", { cwd: rootDir, stdio: "inherit" });
    execSync("./node_modules/.bin/prisma generate --schema=./prisma/schema.prisma", {
      stdio: "inherit",
      cwd: rootDir,
      env: {
        ...process.env,
        PRISMA_SCHEMA_PATH: "./prisma/schema.prisma",
      },
    });
    console.log("[trigger] Copying generated Prisma client to node_modules/.prisma...");
    const copyCommand = [
      "set -euo pipefail",
      "src=$(find node_modules/.pnpm -path \"*/node_modules/.prisma\" | head -n 1)",
      'if [ -z "$src" ]; then echo "[trigger] prisma client not found under node_modules/.pnpm"; exit 1; fi',
      "rm -rf node_modules/.prisma",
      'cp -R "$src" node_modules/.prisma',
    ].join(" && ");
    execSync(`bash -lc '${copyCommand}'`, { cwd: rootDir, stdio: "inherit" });
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
    "node_modules/@prisma/client/**",
    "prisma/schema.prisma",
    "prisma/migrations/**",
    "assets/**",
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
