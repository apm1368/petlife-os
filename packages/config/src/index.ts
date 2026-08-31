import { z, type ZodTypeAny } from "zod";

/**
 * Parses process.env against a Zod schema and fails fast with a readable
 * error instead of letting the app boot with missing/invalid config.
 */
export function loadEnv<T extends ZodTypeAny>(schema: T, source: NodeJS.ProcessEnv = process.env): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }
  return result.data;
}

export { z };
