// Actual lint dependency resolution in CI; an explicit isolated fixture root is
// allowed locally and must be disclosed as such, never reported as workspace CI.
const { createRequire } = require("node:module");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const test = require("node:test");

const fixture = process.env.BRACE_EXPANSION_QA_ROOT;
const rootRequire = createRequire(path.join(fixture || path.resolve(__dirname, "../packages/eslint-config"), "package.json"));
const parserRequire = fixture ? rootRequire : createRequire(createRequire(rootRequire.resolve("typescript-eslint")).resolve("@typescript-eslint/typescript-estree"));
const minimatchPath = parserRequire.resolve("minimatch");
const minimatchRequire = createRequire(minimatchPath);
const bracePath = minimatchRequire.resolve("brace-expansion");
const brace = minimatchRequire("brace-expansion");

test("lint glob parser resolves the pinned patched brace implementation", () => {
  assert.equal(minimatchRequire("brace-expansion/package.json").version, "5.0.12");
  assert.equal(brace.EXPANSION_MAX_DEPTH, 1000);
  assert.equal(brace.EXPANSION_MAX_REWRITES, 1000);
});

test("ordinary lint paths, sequences and escaped braces retain behavior", () => {
  assert.deepEqual(brace.expand("src/{a,b}.{ts,tsx}"), ["src/a.ts", "src/a.tsx", "src/b.ts", "src/b.tsx"]);
  assert.deepEqual(brace.expand("file{01..03}.ts"), ["file01.ts", "file02.ts", "file03.ts"]);
  assert.deepEqual(brace.expand("literal\\{a,b\\}"), ["literal{a,b}"]);
});

function boundedExpand(input, options) {
  // Tiny synthetic inputs/options only, isolated and bounded even on failure.
  const child = "const b=require(process.argv[1]);process.stdout.write(JSON.stringify(b.expand(process.argv[2],JSON.parse(process.argv[3]))));";
  return JSON.parse(execFileSync(process.execPath, ["--max-old-space-size=64", "-e", child, bracePath, input, JSON.stringify(options)], { timeout: 1500, maxBuffer: 65536, encoding: "utf8" }));
}

test("nested and malformed rewrites obey small configured bounds", () => {
  const nested = "{{{{a,b}}}}";
  const rewrite = "{a}" + "}".repeat(8) + ",z}";
  assert.deepEqual(boundedExpand(nested, { maxDepth: 1 }), [nested]);
  assert.deepEqual(boundedExpand(rewrite, { maxRewrites: 2 }), [rewrite]);
});

test("chained sets obey count and aggregate output length budgets", () => {
  const values = boundedExpand("{a,b}".repeat(8), { max: 8, maxLength: 32 });
  assert.equal(values.length, 4);
  assert.equal(values.reduce((sum, value) => sum + value.length, 0), 32);
});

test("the consuming minimatch still accepts actual lint glob shapes", () => {
  const { minimatch } = parserRequire("minimatch");
  assert.equal(minimatch("apps/web/page.tsx", "apps/{web,api}/**/*.{ts,tsx}"), true);
  assert.equal(minimatch("apps/api/src/main.ts", "apps/{web,api}/**/*.{ts,tsx}"), true);
  assert.equal(minimatch("apps/web/image.png", "apps/{web,api}/**/*.{ts,tsx}"), false);
});
