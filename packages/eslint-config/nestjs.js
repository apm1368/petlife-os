// @ts-check
const base = require("./base");

// Note: no-floating-promises requires type-aware linting (parserOptions.project)
// which we don't wire up per-package here to keep the shared config simple.
module.exports = [...base];
