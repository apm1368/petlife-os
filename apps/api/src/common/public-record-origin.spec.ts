import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { excludeDemoRecordsFromPublicReads } from "./public-record-origin";

const apiRoot = resolve(__dirname, "../../");

describe("public demo record provenance", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDeploymentEnvironment = process.env.DEPLOYMENT_ENVIRONMENT;

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalDeploymentEnvironment === undefined) delete process.env.DEPLOYMENT_ENVIRONMENT;
    else process.env.DEPLOYMENT_ENVIRONMENT = originalDeploymentEnvironment;
  });

  it("excludes only explicitly marked demo-origin records in production", () => {
    process.env.NODE_ENV = "production";
    expect(excludeDemoRecordsFromPublicReads()).toEqual({ isDemoRecord: false });
    process.env.NODE_ENV = "test";
    expect(excludeDemoRecordsFromPublicReads()).toEqual({});
  });

  it("also excludes demo records when production is identified by the deploy contract", () => {
    process.env.NODE_ENV = "development";
    process.env.DEPLOYMENT_ENVIRONMENT = "production";
    expect(excludeDemoRecordsFromPublicReads()).toEqual({ isDemoRecord: false });

    process.env.DEPLOYMENT_ENVIRONMENT = "staging";
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

  it("backfills Batch 5 public QA places and partners by deterministic fixture IDs", () => {
    const seed = readFileSync(resolve(apiRoot, "prisma/seed-batch5.ts"), "utf8");
    const migration = readFileSync(
      resolve(apiRoot, "prisma/migrations/20261105120000_public_demo_record_provenance/migration.sql"),
      "utf8",
    );
    const places = /const PLACES = \[([\s\S]*?)\n\] as const/.exec(seed)?.[1];
    expect(places).toBeTruthy();
    const placeKeys = [...places!.matchAll(/\{ key: "([^"]+)"/g)].map((match) => match[1]!);
    expect(placeKeys).toHaveLength(11);

    const seededId = (key: string) => {
      const hash = createHash("sha256").update(`petlife-batch5-qa:${key}`).digest("hex").slice(0, 32);
      return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20)}`;
    };
    for (const key of placeKeys) expect(migration).toContain(`'${seededId(`place:${key}`)}'::uuid`);
    for (const key of ["A", "B", "C"]) expect(migration).toContain(`'${seededId(`org:${key}`)}'::uuid`);
    expect(seed).toMatch(/create:\s*\{\s*id:\s*orgId\[key\],\s*name:\s*p\.name,[^}]*isDemoRecord:\s*true/);
    expect(seed).toMatch(/create:\s*\{\s*id:\s*placeId,\s*isDemoRecord:\s*true,/);
  });

  it("requires a known seed account as well as the legacy provider name", () => {
    const migration = readFileSync(
      resolve(apiRoot, "prisma/migrations/20261105120000_public_demo_record_provenance/migration.sql"),
      "utf8",
    );
    const legacyProviderUpdate = /UPDATE "provider_organizations"[\s\S]*?AND EXISTS \(([\s\S]*?)\);/.exec(migration)?.[1];
    expect(legacyProviderUpdate).toContain('JOIN "users" AS seed_user');
    for (const email of [
      "dr.sara.vet@example.com",
      "reception@example.com",
      "groomer@example.com",
      "trainer@example.com",
      "walker@example.com",
      "sitter@example.com",
      "boarding@example.com",
      "taxi@example.com",
    ]) {
      expect(legacyProviderUpdate).toContain(`'${email}'`);
    }
  });
});
