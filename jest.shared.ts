import type { Config } from "jest";

export const jestSharedConfig: Config = {
  preset: "ts-jest",
  clearMocks: true,
  coverageProvider: "v8",
  testEnvironment: "node",
  setupFiles: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^server-only$": "<rootDir>/tests/mocks/server-only.ts",
    "^@react-pdf/renderer$": "<rootDir>/tests/mocks/react-pdf-renderer.ts",
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
