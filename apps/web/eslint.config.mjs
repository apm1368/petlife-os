import { FlatCompat } from "@eslint/eslintrc";
import nextConfigBase from "@petlife/eslint-config/nextjs";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  ...nextConfigBase,
  ...compat.extends("next/core-web-vitals"),
  {
    rules: {
      // eslint-config-next@14.2.x's `@next/eslint-plugin-next` rules call
      // context.getAncestors(), removed in ESLint 9 — these rules crash
      // rather than reporting under flat config until Next upgrades.
      "@next/next/no-duplicate-head": "off",
    },
  },
  { ignores: [".next/**"] },
];
