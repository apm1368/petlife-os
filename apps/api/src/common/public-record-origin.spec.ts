import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { excludeDemoRecordsFromPublicReads } from "./public-record-origin";

const apiRoot = resolve(__dirname, "../../");

describe("public demo record provenance", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it("excludes only explicitly marked demo-origin records in production", () => {
    process.env.NODE_ENV = "production";
    expect(excludeDemoRecordsFromPublicReads()).toEqual({ isDemoRecord: false });
    process.env.NODE_ENV = "test";
    expect(excludeDemoRecordsFromPublicReads()).toEqual({});
  });

  it("backfills every Batch 4 QA product slug and keeps future QA seeds marked", () => {
    const seed = readFileSync(resolve(apiRoot, "prisma/seed-batch4.ts"), "utf8");
    const migration = readFileSync(
      resolve(apiRoot, "prisma/migrations/20261105120000_public_demo_record_provenance/migration.sql"),
      "utf8",
    );
    const products = /const PRODUCTS: ProductSeed\[\] = \[([\s\S]*?)\n\];\n\nconst CATEGORIES/.exec(seed)?.[1];
    expect(products).toBeTruthy();
    const keys = [...products!.matchAll(/^ {4}key:\s*"([^"]+)"/gm)].map((match) => match[1]!);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(migration).toContain(`'qa-b4-${key}'`);
    expect(seed).toMatch(/create:\s*\{\s*id:\s*productId,\s*isDemoRecord:\s*true,/);
  });
});
