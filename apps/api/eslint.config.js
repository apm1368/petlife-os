// @ts-check
const nestConfig = require("@petlife/eslint-config/nestjs");

module.exports = [...nestConfig, { ignores: ["dist/**", "generated/**"] }];
