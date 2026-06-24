import type { Config } from "jest";

export const jestSharedConfig: Config = {
  preset: "ts-jest",
  clearMocks: true,
  coverageProvider: "v8",
  testEnvironment: "node",
  setupFiles: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    // `server-only` is a Next.js build-time guard (throws if imported in a client
    // bundle); under jest it must be a no-op so server modules can be unit-tested.
    "^server-only$": "<rootDir>/tests/helpers/empty-module.ts",
  },
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        tsconfig: {
          target: "ES2019",
          module: "commonjs",
          moduleResolution: "node",
          esModuleInterop: true,
          resolveJsonModule: true,
          jsx: "react-jsx",
        },
      },
    ],
  },
};
