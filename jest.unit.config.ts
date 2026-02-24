import type { Config } from "jest";
import { jestSharedConfig } from "./jest.shared";

const config: Config = {
  ...jestSharedConfig,
  displayName: "unit",
  testMatch: ["<rootDir>/tests/unit/**/*.test.ts"],
};

export default config;
