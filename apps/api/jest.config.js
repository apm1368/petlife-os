/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": "ts-jest",
  },
  collectCoverageFrom: ["**/*.(t|j)s"],
  coverageDirectory: "../coverage",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@petlife/types$": "<rootDir>/../../../packages/types/src/index.ts",
    "^@petlife/validation$": "<rootDir>/../../../packages/validation/src/index.ts",
    "^@petlife/config$": "<rootDir>/../../../packages/config/src/index.ts",
  },
};
