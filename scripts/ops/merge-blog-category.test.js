// node --test scripts/ops/merge-blog-category.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { planMerge } = require("./merge-blog-category");

const loc = (locale, slug) => ({ id: `l-${locale}`, locale, slug, name: slug });
const target = { id: "db8233ef", locales: ["fa", "en", "de", "es"].map((l) => loc(l, "care-and-health")), articleIds: ["a1", "a2"] };
const source = { id: "28e39a2f", locales: [loc("ar", "care-and-health"), loc("nl", "verzorging-en-gezondheid")], articleIds: ["a3", "a4", "a5"] };

test("moves the source's ar/nl names and every source article onto the target", () => {
  const plan = planMerge({ source, target });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.moveLocales.map((l) => l.locale), ["ar", "nl"]);
  assert.deepEqual(plan.moveArticleIds, ["a3", "a4", "a5"]);
  assert.deepEqual(plan.after, { targetLocales: ["ar", "de", "en", "es", "fa", "nl"], targetArticles: 5, sourceLocales: 0, sourceArticles: 0 });
});

test("stops on a locale both categories name, and on merging a category into itself", () => {
  assert.deepEqual(planMerge({ source: { ...source, locales: [...source.locales, loc("en", "care")] }, target }), { ok: false, reason: "LOCALE_CONFLICT", conflicts: ["en"] });
  assert.deepEqual(planMerge({ source: target, target }), { ok: false, reason: "SOURCE_IS_TARGET" });
});

test("an empty source is a no-op plan, never an error", () => {
  const plan = planMerge({ source: { id: "x", locales: [], articleIds: [] }, target });
  assert.equal(plan.ok, true);
  assert.equal(plan.moveArticleIds.length, 0);
});
