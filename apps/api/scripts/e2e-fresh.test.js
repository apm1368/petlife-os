// Exercise runner failure/cleanup paths without connecting to any database.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

function run(scenario, databaseUrl = "postgresql://user:secret@127.0.0.1:5432/example_test") {
  const dir = mkdtempSync(join(tmpdir(), "e2e-fresh-runner-test-"));
  try {
    const preload = join(dir, "preload.js");
    const events = join(dir, "events");
    writeFileSync(preload, `
      const Module = require('node:module');
      const fs = require('node:fs');
      const original = Module._load;
      Module._load = function(name, ...args) {
        if (name === '@prisma/client') return { PrismaClient: class {
          async $executeRawUnsafe(sql) {
            fs.appendFileSync(process.env.EVENT_FILE, sql.startsWith('CREATE') ? 'CREATE\\n' : 'DROP\\n');
            if (sql.startsWith('CREATE') && process.env.SCENARIO === 'create-fail') throw Error('secret connection string');
            if (sql.startsWith('DROP') && process.env.SCENARIO.includes('drop-fail')) throw Error('secret connection string');
          }
          async $disconnect() { fs.appendFileSync(process.env.EVENT_FILE, 'DISCONNECT\\n'); }
        }};
        if (name === 'node:child_process') return { spawnSync: (_cmd, args) => {
          fs.appendFileSync(process.env.EVENT_FILE, args[0] === 'prisma' ? 'MIGRATE\\n' : 'JEST\\n');
          return { status: args[0] === 'prisma' && process.env.SCENARIO.includes('migrate-fail') ? 1 : 0 };
        }};
        return original.call(this, name, ...args);
      };
    `);
    writeFileSync(events, "");
    const result = spawnSync(process.execPath, ["--require", preload, join(__dirname, "e2e-fresh.js")], {
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "", DATABASE_URL: "", TEST_DATABASE_URL: databaseUrl, SCENARIO: scenario, EVENT_FILE: events },
    });
    return { ...result, events: readFileSync(events, "utf8") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("rejects a non-test target before connecting", () => {
  const r = run("ok", "postgresql://user:secret@127.0.0.1:5432/production");
  assert.equal(r.status, 2);
  assert.equal(r.events, "");
  assert.match(r.stderr, /must point at a \*_test database/);
});

test("reports connection failure without dropping or exposing credentials", () => {
  const r = run("create-fail");
  assert.equal(r.status, 1);
  assert.equal(r.events, "CREATE\nDISCONNECT\n");
  assert.match(r.stderr, /cannot create a temporary test database/);
  assert.doesNotMatch(r.stderr, /secret|UnhandledPromiseRejection|PrismaClientInitializationError/);
});

test("cleanup failures do not mask the original migration failure", () => {
  const r = run("migrate-fail-drop-fail");
  assert.equal(r.status, 1);
  assert.equal(r.events, "CREATE\nMIGRATE\nDROP\nDROP\nDISCONNECT\n");
  assert.match(r.stderr, /migrate deploy failed/);
  assert.match(r.stderr, /failed to drop temporary database/);
  assert.doesNotMatch(r.stderr, /secret|UnhandledPromiseRejection/);
});

test("successful tests still fail if cleanup fails", () => {
  const r = run("drop-fail");
  assert.equal(r.status, 1);
  assert.equal(r.events, "CREATE\nMIGRATE\nJEST\nDROP\nDROP\nDISCONNECT\n");
});

test("successful run drops both disposable databases", () => {
  const r = run("ok");
  assert.equal(r.status, 0);
  assert.equal(r.events, "CREATE\nMIGRATE\nJEST\nDROP\nDROP\nDISCONNECT\n");
  assert.match(r.stdout, /dropped/);
});
