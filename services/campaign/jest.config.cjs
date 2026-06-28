module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  collectCoverageFrom: ["src/**/*.ts", "!src/server.ts", "!src/stream.ts"],
  coverageThreshold: { global: { lines: 50, statements: 50, functions: 50, branches: 50 } }
};

