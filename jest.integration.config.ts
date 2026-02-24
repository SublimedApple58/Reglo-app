import type { Config } from "jest";
import { jestSharedConfig } from "./jest.shared";

const config: Config = {
  ...jestSharedConfig,
  displayName: "integration",
  testMatch: ["<rootDir>/tests/integration/**/*.test.ts"],
  maxWorkers: 1,
};

export default config;
