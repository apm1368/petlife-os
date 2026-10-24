import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

/**
 * Security finding C — raw-SQL-only constraints (CHECKs, partial/unique indexes) must not drift away.
 * Prisma's schema cannot express them, so a later generated migration could silently drop one. This
 * replays every migration in order (adds minus drops) to get the set that must exist, then asserts
 * each is present in the migrated database — CI runs it on a fresh database; run it with
 * TEST_DATABASE_URL pointing at an upgraded copy to check the upgrade path the same way.
 */
const MIGRATIONS = join(__dirname, "..", "prisma", "migrations");
const ident = String.raw`"?([A-Za-z0-9_]+)"?`;

function expectedFromMigrations() {
  // name → owning table, so a later DROP TABLE removes what it took with it.
  const checks = new Map<string, string>();
  const indexes = new Map<string, string>();
  const dirs = readdirSync(MIGRATIONS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  for (const dir of dirs) {
    const sql = readFileSync(join(MIGRATIONS, dir, "migration.sql"), "utf8").replace(/--[^\n]*/g, "");
    const events: { at: number; apply: () => void }[] = [];
    const on = (pattern: string, apply: (m: RegExpMatchArray) => void) => {
      for (const m of sql.matchAll(new RegExp(pattern, "gi"))) events.push({ at: m.index!, apply: () => apply(m) });
    };
    const dropOwned = (table: string) => {
      for (const map of [checks, indexes]) for (const [name, owner] of map) if (owner === table) map.delete(name);
    };
    on(String.raw`ALTER TABLE ${ident} ADD CONSTRAINT ${ident}\s+CHECK`, (m) => checks.set(m[2]!, m[1]!));
    on(String.raw`DROP CONSTRAINT (?:IF EXISTS )?${ident}`, (m) => checks.delete(m[1]!));
    on(String.raw`CREATE (?:UNIQUE )?INDEX (?:CONCURRENTLY )?(?:IF NOT EXISTS )?${ident}\s+ON\s+(?:"?public"?\.)?${ident}`, (m) => indexes.set(m[1]!, m[2]!));
    on(String.raw`DROP INDEX (?:CONCURRENTLY )?(?:IF EXISTS )?(?:"?public"?\.)?${ident}`, (m) => indexes.delete(m[1]!));
    on(String.raw`ALTER INDEX ${ident} RENAME TO ${ident}`, (m) => { const owner = indexes.get(m[1]!) ?? ""; indexes.delete(m[1]!); indexes.set(m[2]!, owner); });
    on(String.raw`DROP TABLE (?:IF EXISTS )?${ident}`, (m) => dropOwned(m[1]!));
    on(String.raw`ALTER TABLE ${ident} RENAME TO ${ident}`, (m) => {
      for (const map of [checks, indexes]) for (const [name, owner] of map) if (owner === m[1]) map.set(name, m[2]!);
    });
    for (const event of events.sort((a, b) => a.at - b.at)) event.apply();
  }
  return { checks, indexes };
}

describe("Schema: raw-SQL constraints survive migration (finding C)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const expected = expectedFromMigrations();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("finds the raw-SQL invariants it is meant to guard", () => {
    // Sanity: the parser sees the known families (financial, inventory, contact, microchip, interest).
    expect(expected.checks.size).toBeGreaterThan(50);
    expect([...expected.checks.keys()]).toEqual(expect.arrayContaining(["ledger_entries_amount_positive", "inventory_items_reserved_le_onHand", "orders_amounts_nonnegative"]));
  });

  it("every CHECK constraint added by a migration and not dropped later exists", async () => {
    const rows = await prisma.$queryRaw<{ conname: string }[]>`select conname from pg_constraint where contype = 'c'`;
    const present = new Set(rows.map((r) => r.conname));
    const missing = [...expected.checks.entries()].filter(([name]) => !present.has(name)).map(([name, table]) => `${name} on ${table}`);
    expect(missing).toEqual([]);
  });

  it("every index (including partial and unique-where) created by a migration and not dropped later exists", async () => {
    const rows = await prisma.$queryRaw<{ indexname: string }[]>`select indexname from pg_indexes where schemaname = 'public'`;
    const present = new Set(rows.map((r) => r.indexname));
    const missing = [...expected.indexes.entries()].filter(([name]) => !present.has(name)).map(([name, table]) => `${name} on ${table}`);
    expect(missing).toEqual([]);
  });
});
