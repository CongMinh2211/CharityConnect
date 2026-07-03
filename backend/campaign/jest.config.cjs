module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  collectCoverageFrom: ["src/**/*.ts", "!src/server.ts", "!src/stream.ts"],
  coverageThreshold: { global: { lines: 80, statements: 80, functions: 80, branches: 60 } }
};
