// @ts-check
const base = require("./base");

module.exports = [
  ...base,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];
