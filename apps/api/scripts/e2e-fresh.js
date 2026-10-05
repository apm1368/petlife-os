#!/usr/bin/env node
/**
 * Local regression on a throw-away database, so results never depend on data earlier runs left behind
 * (e.g. discovery tests that page through "all verified providers").
 *
 *   pnpm --filter @petlife/api test:e2e:fresh [jest args…]
 *
 * Creates `petlife_os_e2e_<stamp>_test` on the server in TEST_DATABASE_URL (or DATABASE_URL), applies every
 * migration from zero, runs the e2e suite against it, then drops it — and the cross-domain suite's
 * `<name>_xdomain_test` sibling — even when tests fail or the run is interrupted. Refuses to touch a server
 * whose URL doesn't name a *_test database, so it can't be pointed at a real one by mistake.
 */
const { spawnSync } = require("node:child_process");
const { PrismaClient } = require("@prisma/client");

const base = new URL(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || "");
if (!base.pathname.endsWith("_test")) {
  console.error("e2e-fresh: TEST_DATABASE_URL must point at a *_test database on the server to use.");
  process.exit(2);
}
const name = `petlife_os_e2e_${Date.now().toString(36)}_${process.pid}_test`;
const fresh = new URL(base);
fresh.pathname = `/${name}`;
const admin = new URL(base);
admin.pathname = "/postgres";
admin.search = "";

const db = new PrismaClient({ datasourceUrl: admin.toString() });
let dropped = false;
async function drop() {
  if (dropped) return;
  dropped = true;
  for (const n of [name, `${name.replace(/_test$/, "")}_xdomain_test`]) await db.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${n}" WITH (FORCE)`);
  await db.$disconnect();
  console.log(`e2e-fresh: dropped ${name}`);
}
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => drop().finally(() => process.exit(130)));

(async () => {
  let code = 1;
  try {
    await db.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    console.log(`e2e-fresh: created ${name}`);
    const env = { ...process.env, DATABASE_URL: fresh.toString(), TEST_DATABASE_URL: fresh.toString() };
    const migrate = spawnSync("npx", ["prisma", "migrate", "deploy"], { env, stdio: "inherit" });
    if (migrate.status !== 0) throw new Error("migrate deploy failed");
    const jest = spawnSync("npx", ["jest", "--config", "./test/jest-e2e.json", ...process.argv.slice(2)], { env, stdio: "inherit" });
    code = jest.status ?? 1;
  } catch (e) {
    console.error(`e2e-fresh: ${e.message}`);
  } finally {
    await drop();
  }
  process.exit(code);
})();
