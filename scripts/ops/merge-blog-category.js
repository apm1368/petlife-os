#!/usr/bin/env node
/**
 * Merges one blog (content) category into another — a data fix, dry-run by default, never deletes an article.
 *
 * Why (2026-11-13): the ar/nl article bundle created its own "care" category (28e39a2f…, ar/nl names only) next to
 * the existing one (db8233ef…, fa/en/de/es), because the importer matches an existing category only by the
 * bundle's own locale slugs. Articles have one category, so the ar/nl import also moved those articles off the
 * fa/en/de/es category. This moves the source's locale names and articles onto the target.
 *
 *   cd /var/www/petlife-os/apps/api && set -a && . ./.env && set +a && \
 *     PRISMA_CLIENT=/var/www/petlife-os/node_modules/.pnpm/node_modules/@prisma/client \
 *     node ../../scripts/ops/merge-blog-category.js --source <uuid> --target <uuid> [--apply] [--drop-empty-source]
 *
 *   (restore)  ... node ../../scripts/ops/merge-blog-category.js --restore <backup.json> [--apply]
 *
 * - Dry run (default): prints both categories, their locale names, article counts and the exact plan. No writes.
 * - --apply: first writes a backup of every row it will touch to BACKUP_DIR (default /root/opetlife-backups, file
 *   mode 600), then in ONE transaction moves the source's locale names the target lacks and every source article to
 *   the target. A locale both have is a conflict: it stops before writing anything.
 * - --drop-empty-source: also removes the source category row, only if it is left with no names and no articles.
 * - --restore <file>: puts the backed-up category ids and names back exactly (dry-run unless --apply).
 */
const { mkdirSync, writeFileSync, readFileSync, chmodSync } = require("node:fs");
const { join } = require("node:path");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pure plan from the current rows (tested without a database).
 * @param {{ source: {id:string, locales:{id:string, locale:string, slug:string, name:string}[], articleIds:string[]},
 *           target: {id:string, locales:{id:string, locale:string, slug:string, name:string}[], articleIds:string[]} }} state
 */
function planMerge(state) {
  const { source, target } = state;
  if (source.id === target.id) return { ok: false, reason: "SOURCE_IS_TARGET" };
  const targetLocales = new Set(target.locales.map((l) => l.locale));
  const conflicts = source.locales.filter((l) => targetLocales.has(l.locale)).map((l) => l.locale);
  if (conflicts.length) return { ok: false, reason: "LOCALE_CONFLICT", conflicts };
  const moveLocales = source.locales.map((l) => ({ id: l.id, locale: l.locale, slug: l.slug, name: l.name }));
  const after = {
    targetLocales: [...target.locales.map((l) => l.locale), ...moveLocales.map((l) => l.locale)].sort(),
    targetArticles: target.articleIds.length + source.articleIds.length,
    sourceLocales: 0,
    sourceArticles: 0,
  };
  return { ok: true, moveLocales, moveArticleIds: [...source.articleIds], after };
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function snapshot(db, id) {
  const category = await db.category.findUnique({ where: { id } });
  if (!category) return null;
  const locales = await db.categoryLocale.findMany({ where: { categoryId: id }, orderBy: { locale: "asc" } });
  const articles = await db.article.findMany({ where: { categoryId: id }, select: { id: true, categoryId: true, locales: { select: { locale: true, slug: true, status: true } } }, orderBy: { id: "asc" } });
  return { category, locales, articles, articleIds: articles.map((a) => a.id) };
}

function describe(label, s) {
  const visible = {};
  for (const a of s.articles) for (const l of a.locales) if (l.status === "VISIBLE") visible[l.locale] = (visible[l.locale] ?? 0) + 1;
  console.log(`${label} ${s.category.id}`);
  console.log(`  names:    ${s.locales.map((l) => `${l.locale}=${l.slug}`).join(", ") || "(none)"}`);
  console.log(`  articles: ${s.articles.length} (visible per locale: ${JSON.stringify(visible)})`);
}

async function merge(db, apply) {
  const sourceId = arg("--source"), targetId = arg("--target");
  if (!UUID.test(sourceId ?? "") || !UUID.test(targetId ?? "")) throw new Error("--source and --target must be full category UUIDs");
  const [source, target] = await Promise.all([snapshot(db, sourceId), snapshot(db, targetId)]);
  if (!source || !target) throw new Error(`category not found: ${!source ? sourceId : targetId}`);
  console.log(`== BEFORE (${apply ? "APPLY" : "DRY RUN"})`);
  describe("source", source);
  describe("target", target);
  const plan = planMerge({ source: { id: sourceId, locales: source.locales, articleIds: source.articleIds }, target: { id: targetId, locales: target.locales, articleIds: target.articleIds } });
  if (!plan.ok) {
    console.log(`== STOP: ${plan.reason}${plan.conflicts ? ` (${plan.conflicts.join(", ")})` : ""} — nothing written`);
    process.exitCode = 2;
    return;
  }
  console.log("== PLAN");
  console.log(`  move names:    ${plan.moveLocales.map((l) => `${l.locale}=${l.slug}`).join(", ") || "(none)"}`);
  console.log(`  move articles: ${plan.moveArticleIds.length}`);
  console.log(`  expected after: target names ${plan.after.targetLocales.join(",")}, target articles ${plan.after.targetArticles}; source names 0, articles 0`);
  const drop = process.argv.includes("--drop-empty-source");
  if (drop) console.log("  then remove the empty source category row");
  if (!apply) {
    console.log("== DRY RUN: nothing written. Re-run with --apply to back up and merge.");
    return;
  }

  const dir = process.env.BACKUP_DIR || "/root/opetlife-backups";
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `blog-category-merge-${sourceId.slice(0, 8)}-into-${targetId.slice(0, 8)}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ kind: "blog-category-merge", at: new Date().toISOString(), sourceId, targetId, source, target }, null, 2), { mode: 0o600 });
  chmodSync(file, 0o600);
  console.log(`== BACKUP ${file}`);

  await db.$transaction(async (tx) => {
    // Re-check inside the transaction: nothing may have changed since the snapshot.
    const now = await tx.categoryLocale.findMany({ where: { categoryId: { in: [sourceId, targetId] } } });
    const targetNow = new Set(now.filter((l) => l.categoryId === targetId).map((l) => l.locale));
    if (plan.moveLocales.some((l) => targetNow.has(l.locale))) throw new Error("target gained a conflicting locale since the snapshot; nothing written");
    const names = await tx.categoryLocale.updateMany({ where: { id: { in: plan.moveLocales.map((l) => l.id) }, categoryId: sourceId }, data: { categoryId: targetId } });
    const articles = await tx.article.updateMany({ where: { id: { in: plan.moveArticleIds }, categoryId: sourceId }, data: { categoryId: targetId } });
    if (names.count !== plan.moveLocales.length || articles.count !== plan.moveArticleIds.length) throw new Error(`moved ${names.count}/${plan.moveLocales.length} names and ${articles.count}/${plan.moveArticleIds.length} articles; rolled back`);
    const stray = await tx.article.count({ where: { categoryId: sourceId } });
    if (stray) throw new Error(`${stray} article(s) were added to the source meanwhile; rolled back`);
    if (drop) {
      const left = await tx.categoryLocale.count({ where: { categoryId: sourceId } });
      if (left === 0) await tx.category.delete({ where: { id: sourceId } });
    }
  });

  const [sourceAfter, targetAfter] = await Promise.all([snapshot(db, sourceId), snapshot(db, targetId)]);
  console.log("== AFTER");
  if (sourceAfter) describe("source", sourceAfter);
  else console.log(`source ${sourceId} removed (it was empty)`);
  describe("target", targetAfter);
}

async function restore(db, apply) {
  const file = arg("--restore");
  const backup = JSON.parse(readFileSync(file, "utf8"));
  if (backup.kind !== "blog-category-merge") throw new Error("not a blog-category-merge backup");
  const { sourceId, targetId, source } = backup;
  console.log(`== RESTORE ${apply ? "(APPLY)" : "(DRY RUN)"} from ${file}`);
  console.log(`  put back on ${sourceId}: names ${source.locales.map((l) => l.locale).join(",") || "(none)"}, articles ${source.articleIds.length}`);
  if (!apply) return;
  await db.$transaction(async (tx) => {
    await tx.category.upsert({ where: { id: sourceId }, create: { id: sourceId }, update: {} });
    await tx.categoryLocale.updateMany({ where: { id: { in: source.locales.map((l) => l.id) }, categoryId: targetId }, data: { categoryId: sourceId } });
    await tx.article.updateMany({ where: { id: { in: source.articleIds }, categoryId: targetId }, data: { categoryId: sourceId } });
  });
  console.log("== RESTORED");
}

async function main() {
  const { PrismaClient } = require(process.env.PRISMA_CLIENT || "@prisma/client");
  const db = new PrismaClient();
  const apply = process.argv.includes("--apply");
  try {
    if (arg("--restore")) await restore(db, apply);
    else await merge(db, apply);
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

module.exports = { planMerge };
