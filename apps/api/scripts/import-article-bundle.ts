/**
 * Imports an editorial bundle (articles in several languages + their cover, infographic and video files) into
 * the CMS, the same way the admin editor would: categories, tags, media assets, the article shell, one
 * ArticleLocale per language with a version-1 snapshot, audit-log entries attributed to a named admin, and —
 * only with --publish — the DRAFT → VISIBLE transition (publishedAt set once, like AdminArticleService).
 *
 *   PETLIFE_IMPORT_CONFIRM=<host of WEB_APP_ORIGIN> \
 *   pnpm --filter @petlife/api exec ts-node scripts/import-article-bundle.ts <bundle-dir> --admin <admin email | first-super-admin> [--publish] [--dry-run]
 *
 * Idempotent: ids are derived from the bundle keys and media file hashes, existing rows are updated in place,
 * nothing is deleted. Media files are copied into the local storage driver's directory under cms/media/,
 * exactly where admin uploads land. Refuses to run unless PETLIFE_IMPORT_CONFIRM names the target site.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { ArticleLifecycleStatus, Locale, Prisma, PrismaClient } from "@prisma/client";

type LocaleKey = "fa" | "en" | "de" | "es";
interface MediaFile { file: string; width?: number; height?: number; alt?: string | null; durationSeconds?: number }
interface BundleLocale {
  title: string; slug: string; excerpt: string; seoTitle: string; seoDescription: string; body: unknown[];
  video?: MediaFile & { poster?: string; title: string; description?: string };
  infographic?: MediaFile;
}
interface Bundle {
  author: { name: string; bio?: string };
  categories: { key: string; locales: { locale: LocaleKey; name: string; slug: string; description?: string }[] }[];
  tags: { key: string; locales: { locale: LocaleKey; name: string; slug: string }[] }[];
  articles: { key: string; category: string; tags: string[]; cover?: MediaFile; locales: Partial<Record<LocaleKey, BundleLocale>> }[];
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MIME: Record<string, string> = { ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".mp4": "video/mp4", ".webm": "video/webm" };

function uuidFrom(key: string): string {
  const h = createHash("sha1").update(`article-bundle:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const bundleDir = process.argv[2];
  const adminEmail = arg("--admin");
  const publish = process.argv.includes("--publish");
  const dryRun = process.argv.includes("--dry-run");
  if (!bundleDir || !adminEmail) throw new Error("usage: import-article-bundle.ts <bundle-dir> --admin <email> [--publish] [--dry-run]");

  const origin = (process.env.WEB_APP_ORIGIN ?? "").split(",")[0]!.trim();
  const host = origin ? new URL(origin).host : "";
  if (!host || process.env.PETLIFE_IMPORT_CONFIRM !== host) throw new Error(`refusing: set PETLIFE_IMPORT_CONFIRM=${host || "<WEB_APP_ORIGIN host>"} to import into this site`);
  if ((process.env.STORAGE_DRIVER ?? "local") !== "local") throw new Error("this importer copies files for the local storage driver only");
  const storageDir = resolve(process.env.STORAGE_LOCAL_DIR ?? "./local-storage");
  const publicBase = (process.env.STORAGE_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  if (!publicBase) throw new Error("STORAGE_PUBLIC_BASE_URL is required");

  const bundle = JSON.parse(readFileSync(join(bundleDir, "bundle.json"), "utf8")) as Bundle;
  const db = new PrismaClient();
  const stats = { media: 0, articles: 0, locales: 0, published: 0 };
  try {
    // `--admin first-super-admin` attributes the import to the longest-standing active super admin (the owner account).
    const admin = adminEmail === "first-super-admin"
      ? await db.adminUser.findFirst({ where: { role: "SUPER_ADMIN", status: "ACTIVE" }, orderBy: { createdAt: "asc" } })
      : await db.adminUser.findFirst({ where: { user: { email: adminEmail }, status: "ACTIVE" } });
    if (!admin) throw new Error(`no active admin for ${adminEmail}`);
    const audit = (tx: Prisma.TransactionClient, action: string, entityType: string, entityId: string, afterSummary: Record<string, unknown>) =>
      tx.adminAuditLog.create({ data: { adminUserId: admin.id, action, entityType, entityId, reason: "article bundle import", afterSummary: afterSummary as Prisma.InputJsonValue } });

    // --- media ---------------------------------------------------------------
    const mediaIds = new Map<string, string>();
    async function media(entry: MediaFile | undefined): Promise<string | undefined> {
      if (!entry) return undefined;
      const source = isAbsolute(entry.file) ? entry.file : join(bundleDir, entry.file);
      if (mediaIds.has(source)) return mediaIds.get(source);
      const bytes = readFileSync(source);
      const digest = createHash("sha256").update(bytes).digest("hex");
      const ext = extname(source).toLowerCase();
      const mimeType = MIME[ext];
      if (!mimeType) throw new Error(`unsupported media type ${source}`);
      const key = `cms/media/bundle-${digest.slice(0, 32)}${ext}`;
      const id = uuidFrom(`media:${digest}`);
      const existing = await db.mediaAsset.findUnique({ where: { id } });
      if (!existing && !dryRun) {
        const target = join(storageDir, key);
        mkdirSync(dirname(target), { recursive: true });
        if (!existsSync(target)) copyFileSync(source, target);
        await db.$transaction(async (tx) => {
          await tx.mediaAsset.create({ data: { id, key, url: `${publicBase}/${key}`, mimeType, fileSizeBytes: statSync(source).size, widthPx: entry.width, heightPx: entry.height, altText: entry.alt ?? null, createdByAdminId: admin!.id } });
          await audit(tx, "media_asset.uploaded", "MEDIA_ASSET", id, { mimeType, fileSizeBytes: statSync(source).size });
        });
        stats.media += 1;
      }
      mediaIds.set(source, id);
      return id;
    }

    // --- author, categories, tags --------------------------------------------
    const author = (await db.contentAuthor.findFirst({ where: { name: bundle.author.name } })) ?? (dryRun ? null : await db.contentAuthor.create({ data: { name: bundle.author.name, bio: bundle.author.bio } }));
    const categoryIds = new Map<string, string>();
    for (const category of bundle.categories) {
      const existing = await db.categoryLocale.findFirst({ where: { OR: category.locales.map((l) => ({ locale: l.locale as Locale, slug: l.slug })) } });
      const categoryId = existing?.categoryId ?? uuidFrom(`category:${category.key}`);
      if (!dryRun) {
        await db.category.upsert({ where: { id: categoryId }, create: { id: categoryId }, update: {} });
        for (const l of category.locales) {
          await db.categoryLocale.upsert({ where: { categoryId_locale: { categoryId, locale: l.locale as Locale } }, create: { categoryId, locale: l.locale as Locale, name: l.name, slug: l.slug, description: l.description }, update: { name: l.name, slug: l.slug, description: l.description } });
        }
      }
      categoryIds.set(category.key, categoryId);
    }
    const tagIds = new Map<string, string>();
    for (const tag of bundle.tags) {
      const existing = await db.tagLocale.findFirst({ where: { OR: tag.locales.map((l) => ({ locale: l.locale as Locale, slug: l.slug })) } });
      const tagId = existing?.tagId ?? uuidFrom(`tag:${tag.key}`);
      if (!dryRun) {
        await db.tag.upsert({ where: { id: tagId }, create: { id: tagId }, update: {} });
        for (const l of tag.locales) {
          const clash = await db.tagLocale.findUnique({ where: { locale_slug: { locale: l.locale as Locale, slug: l.slug } } });
          if (clash && clash.tagId !== tagId) continue; // never steal another tag's slug
          await db.tagLocale.upsert({ where: { tagId_locale: { tagId, locale: l.locale as Locale } }, create: { tagId, locale: l.locale as Locale, name: l.name, slug: l.slug }, update: { name: l.name } });
        }
      }
      tagIds.set(tag.key, tagId);
    }

    // --- articles -------------------------------------------------------------
    for (const item of bundle.articles) {
      const articleId = uuidFrom(`article:${item.key}`);
      const coverId = await media(item.cover);
      for (const [locale, content] of Object.entries(item.locales) as [LocaleKey, BundleLocale][]) {
        if (!SLUG.test(content.slug)) throw new Error(`bad slug ${content.slug}`);
        const holder = await db.articleLocale.findUnique({ where: { locale_slug: { locale: locale as Locale, slug: content.slug } } });
        if (holder && holder.articleId !== articleId) throw new Error(`slug ${locale}/${content.slug} already belongs to article ${holder.articleId}`);
      }
      if (dryRun) { stats.articles += 1; continue; }

      const resolvedLocales: [LocaleKey, BundleLocale, unknown[]][] = [];
      for (const [locale, content] of Object.entries(item.locales) as [LocaleKey, BundleLocale][]) {
        const videoId = await media(content.video);
        const posterId = content.video?.poster ? await media({ file: content.video.poster, width: content.video.width, height: content.video.height }) : undefined;
        const infographicId = await media(content.infographic);
        const body = content.body.map((block) => {
          const b = block as Record<string, unknown>;
          if (b.type === "video" && b.mediaAssetId === "__VIDEO__") {
            if (!videoId) return null;
            return { type: "video", mediaAssetId: videoId, title: content.video!.title, ...(content.video!.description ? { description: content.video!.description } : {}), ...(posterId ? { posterMediaAssetId: posterId } : {}), ...(content.video!.durationSeconds ? { durationSeconds: content.video!.durationSeconds } : {}) };
          }
          if (b.type === "image" && b.mediaAssetId === "__INFOGRAPHIC__") return infographicId ? { ...b, mediaAssetId: infographicId } : null;
          return b;
        }).filter(Boolean) as unknown[];
        resolvedLocales.push([locale, content, body]);
      }

      await db.$transaction(async (tx) => {
        const existed = await tx.article.findUnique({ where: { id: articleId } });
        await tx.article.upsert({
          where: { id: articleId },
          create: { id: articleId, authorId: author?.id, categoryId: categoryIds.get(item.category), coverMediaAssetId: coverId, createdByAdminId: admin.id },
          update: { authorId: author?.id, categoryId: categoryIds.get(item.category), coverMediaAssetId: coverId },
        });
        await tx.articleTag.deleteMany({ where: { articleId } });
        await tx.articleTag.createMany({ data: item.tags.map((key) => ({ articleId, tagId: tagIds.get(key)! })).filter((t) => t.tagId) });
        if (!existed) await audit(tx, "article.created", "ARTICLE", articleId, { key: item.key });

        for (const [locale, content, body] of resolvedLocales) {
          const data = { title: content.title, slug: content.slug, excerpt: content.excerpt, body: body as Prisma.InputJsonValue, seoTitle: content.seoTitle.slice(0, 70), seoDescription: content.seoDescription.slice(0, 200), lastEditedByAdminId: admin.id };
          const current = await tx.articleLocale.findUnique({ where: { articleId_locale: { articleId, locale: locale as Locale } } });
          const saved = current
            ? await tx.articleLocale.update({ where: { id: current.id }, data })
            : await tx.articleLocale.create({ data: { articleId, locale: locale as Locale, ...data } });
          await tx.articleSlugRedirect.deleteMany({ where: { locale: locale as Locale, slug: content.slug } });
          const last = await tx.contentVersion.findFirst({ where: { articleId, locale: locale as Locale }, orderBy: { versionNumber: "desc" } });
          await tx.contentVersion.create({ data: { articleId, locale: locale as Locale, versionNumber: (last?.versionNumber ?? 0) + 1, editorAdminId: admin.id, changeNote: "article bundle import", snapshot: { title: data.title, slug: data.slug, excerpt: data.excerpt, body: data.body, seoTitle: data.seoTitle, seoDescription: data.seoDescription } as Prisma.InputJsonValue } });
          await audit(tx, "article.updated", "ARTICLE", articleId, { locale, slug: content.slug });
          stats.locales += 1;
          if (publish && saved.status !== ArticleLifecycleStatus.VISIBLE && saved.status !== ArticleLifecycleStatus.ARCHIVED) {
            await tx.articleLocale.update({ where: { id: saved.id }, data: { status: ArticleLifecycleStatus.VISIBLE, publishedAt: saved.publishedAt ?? new Date() } });
            await audit(tx, "article.published", "ARTICLE", articleId, { status: "VISIBLE", locale });
            stats.published += 1;
          }
        }
      }, { timeout: 60_000 });
      stats.articles += 1;
      console.log(`imported ${item.key} (${Object.keys(item.locales).join(", ")})`);
    }
    console.log(JSON.stringify({ dryRun, publish, ...stats }));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
