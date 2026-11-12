import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { AdminPriority, AdminTaskSource, CatalogImportItemStatus, CatalogImportJobStatus, Prisma, ProductStatus, WeightUnit } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ApiException, NotFoundApiException } from "../../../common/errors/api-exception";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import { AutomaticTaskService } from "../task/automatic-task.service";
import { AdminFeatureFlagsService } from "../feature-flags/admin-feature-flags.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { StorageService } from "../../storage/storage.service";
import { safeFetch, SourceFetchError } from "../../travel-external/safe-fetch";
import { canonicalDigikalaInput, parseDigikalaCatalogPage, type DigikalaProductSnapshot } from "./digikala-catalog.parser";
import { robotsDisallowsPath } from "./digikala-robots";
import { DIGIKALA_FACTS_HOSTS, DIGIKALA_FACTS_MODE, factsDetailUrl, factsListUrl, parseFactsDetail, parseFactsList, type DigikalaFactsSnapshot } from "./digikala-facts";

/** The one-time facts run (owner, 2026-11-12): at most this many products, one request every few seconds. */
const FACTS_MAX_PRODUCTS = 3000;
const FACTS_DEFAULT_PRODUCTS = 1000;
const FACTS_MAX_PAGES = 500;

const HOSTS = ["digikala.com"];
const MAX_URLS = 20;
const MAX_PAGES = 10;
const MAX_PRODUCTS = 100;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const CRAWLER = "PetLifeDemoTravelCrawler";
export const DIGIKALA_CATALOG_IMPORT_FLAG = "catalog.import.digikala";
const robotsCache = new Map<string, { body: string; expiresAt: number }>();

type ItemSnapshot = DigikalaProductSnapshot;
type JobInput = { urls: string[]; categoryId: string; brandId?: string; maxPages?: number; maxProducts?: number; idempotencyKey: string };

function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function mimeOf(bytes: Buffer): string | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export class CatalogImportBlockedError extends Error { constructor(message: string) { super(message); } }

@Injectable()
export class CatalogImportService {
  private readonly logger = new Logger(CatalogImportService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AdminAuditLogService,
    private readonly tasks: AutomaticTaskService,
    private readonly flags: AdminFeatureFlagsService,
  ) {}

  async availability(admin: ResolvedAdminContext) {
    const evaluation = await this.flags.evaluate(DIGIKALA_CATALOG_IMPORT_FLAG, { userId: admin.userId });
    return { key: DIGIKALA_CATALOG_IMPORT_FLAG, enabled: evaluation.enabled, reason: evaluation.reason };
  }

  private async requireImportEnabled(userId: string) {
    const evaluation = await this.flags.evaluate(DIGIKALA_CATALOG_IMPORT_FLAG, { userId });
    if (!evaluation.enabled) {
      throw new ApiException(
        "CATALOG_IMPORT_UNAVAILABLE",
        "Digikala import is disabled until source access and content/image-use permission are verified and the feature flag is approved.",
        HttpStatus.CONFLICT,
        { featureFlag: DIGIKALA_CATALOG_IMPORT_FLAG, reason: evaluation.reason },
      );
    }
  }

  async createJob(admin: ResolvedAdminContext, input: JobInput, requestId?: string) {
    await this.requireImportEnabled(admin.userId);
    if (!input.urls.length || input.urls.length > MAX_URLS) throw new ApiException("IMPORT_URL_LIMIT", `Provide between 1 and ${MAX_URLS} URLs.`, HttpStatus.BAD_REQUEST);
    const urls = [...new Set(input.urls.map((value) => {
      try { return canonicalDigikalaInput(value).toString(); }
      catch (error) { throw new ApiException("INVALID_IMPORT_URL", error instanceof Error ? error.message : "Invalid source URL.", HttpStatus.BAD_REQUEST); }
    }))];
    const category = await this.prisma.productCategory.findFirst({ where: { id: input.categoryId, status: "ACTIVE" }, select: { id: true } });
    if (!category) throw new NotFoundApiException("Active product category", { categoryId: input.categoryId });
    if (input.brandId) {
      const brand = await this.prisma.brand.findFirst({ where: { id: input.brandId, status: "ACTIVE" }, select: { id: true } });
      if (!brand) throw new NotFoundApiException("Active brand", { brandId: input.brandId });
    }
    const prior = await this.prisma.catalogImportJob.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (prior) return prior;
    let row;
    try {
      row = await this.prisma.catalogImportJob.create({ data: {
        submittedUrls: urls, targetCategoryId: category.id, targetBrandId: input.brandId ?? null,
        maxPages: Math.min(MAX_PAGES, Math.max(1, input.maxPages ?? 5)),
        maxProducts: Math.min(MAX_PRODUCTS, Math.max(1, input.maxProducts ?? 50)),
        requestedById: admin.adminUserId, idempotencyKey: input.idempotencyKey,
      } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const duplicate = await this.prisma.catalogImportJob.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
        if (duplicate) return duplicate;
      }
      throw error;
    }
    await this.audit.record({ adminUserId: admin.adminUserId, action: "catalog_import.queued", entityType: "CATALOG_IMPORT_JOB", entityId: row.id, afterSummary: { urls, categoryId: row.targetCategoryId, maxPages: row.maxPages, maxProducts: row.maxProducts }, requestId });
    return row;
  }

  listJobs() {
    return this.prisma.catalogImportJob.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { items: { orderBy: { createdAt: "asc" }, include: { product: { select: { id: true, title: true, status: true } } } }, targetCategory: { select: { id: true, name: true } } } });
  }

  listActiveBrands() {
    return this.prisma.brand.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, slug: true }, orderBy: [{ name: "asc" }, { id: "asc" }] });
  }

  async cancelJob(admin: ResolvedAdminContext, jobId: string, requestId?: string) {
    const job = await this.prisma.catalogImportJob.findUnique({ where: { id: jobId }, select: { status: true } });
    if (!job) throw new NotFoundApiException("Catalog import job", { jobId });
    if (job.status === CatalogImportJobStatus.QUEUED) {
      await this.prisma.catalogImportJob.update({ where: { id: jobId }, data: { status: CatalogImportJobStatus.CANCELLED, finishedAt: new Date() } });
    } else if (job.status === CatalogImportJobStatus.RUNNING) {
      await this.prisma.catalogImportJob.update({ where: { id: jobId }, data: { cancelRequested: true } });
    }
    await this.audit.record({ adminUserId: admin.adminUserId, action: "catalog_import.cancel_requested", entityType: "CATALOG_IMPORT_JOB", entityId: jobId, beforeSummary: { status: job.status }, afterSummary: { cancelRequested: true }, requestId });
    return this.prisma.catalogImportJob.findUniqueOrThrow({ where: { id: jobId } });
  }

  async processNext(): Promise<boolean> {
    const now = new Date();
    const candidates = await this.prisma.catalogImportJob.findMany({ where: { OR: [
      { status: CatalogImportJobStatus.QUEUED, nextAttemptAt: { lte: now } },
      { status: CatalogImportJobStatus.RUNNING, lockedUntil: { lt: now } },
    ] }, orderBy: { createdAt: "asc" }, take: 50 });
    let candidate: (typeof candidates)[number] | null = null;
    for (const job of candidates) {
      const requester = await this.prisma.adminUser.findFirst({
        where: { id: job.requestedById, status: "ACTIVE" },
        select: { userId: true },
      });
      // The facts-only run was approved by the owner directly; the page/image importer still needs its flag.
      if (requester && (job.mode === DIGIKALA_FACTS_MODE || (await this.flags.evaluate(DIGIKALA_CATALOG_IMPORT_FLAG, { userId: requester.userId })).enabled)) {
        candidate = job;
        break;
      }
    }
    if (!candidate) return false;
    const claimWhere = candidate.status === CatalogImportJobStatus.QUEUED
      ? { id: candidate.id, status: CatalogImportJobStatus.QUEUED, nextAttemptAt: { lte: now } }
      : { id: candidate.id, status: CatalogImportJobStatus.RUNNING, lockedUntil: { lt: now } };
    const locked = await this.prisma.catalogImportJob.updateMany({ where: claimWhere, data: { status: CatalogImportJobStatus.RUNNING, startedAt: now, lockedUntil: new Date(now.getTime() + 10 * 60_000), attempt: { increment: 1 }, lastError: null } });
    if (!locked.count) return false;
    try {
      await (candidate.mode === DIGIKALA_FACTS_MODE ? this.runFactsJob(candidate.id) : this.runJob(candidate.id));
    } catch (e) {
      const attempt = candidate.attempt + 1;
      const permanent = e instanceof CatalogImportBlockedError || e instanceof SourceFetchError && ["BLOCKED_BY_SOURCE", "RATE_LIMITED", "HOST_NOT_ALLOWED", "PRIVATE_ADDRESS"].includes(e.category);
      const terminal = permanent || attempt >= 3;
      const delay = Math.min(30 * 60_000, 60_000 * 2 ** attempt);
      const message = e instanceof Error ? e.message.slice(0, 300) : "Importer failed";
      this.logger.warn(`Catalog import ${candidate.id} failed: ${message}`);
      await this.prisma.catalogImportJob.update({ where: { id: candidate.id }, data: {
        status: terminal ? CatalogImportJobStatus.FAILED : CatalogImportJobStatus.QUEUED,
        nextAttemptAt: new Date(Date.now() + delay), lockedUntil: null, finishedAt: terminal ? new Date() : null, lastError: message,
      } });
      if (terminal) await this.tasks.raise({ dedupeKey: `catalog-import:failed:${candidate.id}`, title: "واردسازی کاتالوگ ناموفق بود", description: `Job ${candidate.id} stopped after ${permanent ? "source/policy failure" : `${attempt} attempts`}: ${message}`, source: AdminTaskSource.FAILED_IMPORT, team: "commerce", priority: AdminPriority.HIGH, relatedEntityType: "CATALOG_IMPORT_JOB", relatedEntityId: candidate.id });
    }
    return true;
  }

  private async robotsFor(url: URL): Promise<string> {
    const root = `${url.protocol}//${url.host}/robots.txt`;
    const cached = robotsCache.get(url.host);
    if (cached && cached.expiresAt > Date.now()) return cached.body;
    const response = await safeFetch(root, HOSTS, { timeoutMs: 8_000, maxBytes: 200_000, accept: "text/plain" });
    if (response.status !== 200) throw new CatalogImportBlockedError("Source robots.txt could not be verified; import stopped.");
    robotsCache.set(url.host, { body: response.body, expiresAt: Date.now() + 6 * 60 * 60_000 });
    return response.body;
  }

  private async fetchPage(url: URL) {
    const robots = await this.robotsFor(url);
    if (robotsDisallowsPath(robots, `${url.pathname}${url.search}`, CRAWLER)) throw new CatalogImportBlockedError("The source robots.txt disallows this page; no workaround was attempted.");
    const response = await safeFetch(url.toString(), HOSTS, { timeoutMs: 10_000, maxBytes: 2_000_000, accept: "text/html" });
    if (!response.contentType?.toLowerCase().includes("text/html")) throw new CatalogImportBlockedError("Source did not return an HTML page.");
    return { html: response.body, url: response.finalUrl };
  }

  private async runJob(jobId: string) {
    const job = await this.prisma.catalogImportJob.findUniqueOrThrow({ where: { id: jobId } });
    const seenPages = new Set<string>();
    const queuedPages = job.submittedUrls.map((url) => canonicalDigikalaInput(url).toString());
    let pages = 0;
    let seen = 0;
    let imported = 0;
    let failed = 0;
    const seenItems = new Set<string>();
    while (queuedPages.length && pages < job.maxPages && seen < job.maxProducts) {
      const rawUrl = queuedPages.shift()!;
      if (seenPages.has(rawUrl)) continue;
      seenPages.add(rawUrl);
      const url = canonicalDigikalaInput(rawUrl);
      const { html, url: finalUrl } = await this.fetchPage(url);
      const page = parseDigikalaCatalogPage(html, finalUrl);
      pages++;
      const snapshots: ItemSnapshot[] = [...page.products];
      if (!snapshots.length && page.productLinks.length) {
        for (const productLink of page.productLinks.slice(0, job.maxProducts - seen)) {
          if (pages >= job.maxPages) break;
          const itemPage = await this.fetchPage(canonicalDigikalaInput(productLink));
          pages++;
          const parsed = parseDigikalaCatalogPage(itemPage.html, itemPage.url).products;
          snapshots.push(...parsed);
          await this.bumpProgress(jobId, pages, seen, imported, failed);
        }
      }
      for (const snapshot of snapshots) {
        if (seen >= job.maxProducts) break;
        if (seenItems.has(snapshot.sourceItemId)) continue;
        seenItems.add(snapshot.sourceItemId);
        seen++;
        try {
          const result = await this.ingestSnapshot(job, snapshot);
          if (result === "IMPORTED") imported++;
          if (result === "FAILED") failed++;
        } catch (e) {
          failed++;
          const detail = e instanceof Error ? e.message.slice(0, 250) : "unknown";
          this.logger.warn(`Product import item ${snapshot.sourceItemId} failed: ${detail}`);
          await this.prisma.catalogImportItem.create({ data: { jobId: job.id, source: "DIGIKALA", sourceItemId: snapshot.sourceItemId, sourceUrl: snapshot.sourceUrl, sourceSnapshot: snapshot as unknown as Prisma.InputJsonValue, sourceHash: hash(snapshot), status: CatalogImportItemStatus.FAILED, errorCode: "IMPORT_ITEM_FAILED", errorDetail: detail } }).catch(() => undefined);
          if (e instanceof CatalogImportBlockedError || e instanceof SourceFetchError && ["BLOCKED_BY_SOURCE", "RATE_LIMITED"].includes(e.category)) throw e;
        }
        await this.bumpProgress(jobId, pages, seen, imported, failed);
        if (await this.cancelRequested(jobId)) break;
      }
      if (page.nextPageUrl && pages < job.maxPages) queuedPages.push(page.nextPageUrl);
      if (await this.cancelRequested(jobId)) break;
    }
    const cancelled = await this.cancelRequested(jobId);
    const itemStatuses = await this.prisma.catalogImportItem.groupBy({ by: ["status"], where: { jobId }, _count: { _all: true } });
    const counts = Object.fromEntries(itemStatuses.map((entry) => [entry.status, entry._count._all]));
    imported = counts[CatalogImportItemStatus.IMPORTED] ?? 0;
    failed = counts[CatalogImportItemStatus.FAILED] ?? 0;
    const review = counts[CatalogImportItemStatus.NEEDS_REVIEW] ?? 0;
    const status = cancelled ? CatalogImportJobStatus.CANCELLED : failed > 0 && imported > 0 ? CatalogImportJobStatus.PARTIAL : failed > 0 ? CatalogImportJobStatus.FAILED : review > 0 ? CatalogImportJobStatus.PARTIAL : imported === 0 ? CatalogImportJobStatus.FAILED : CatalogImportJobStatus.COMPLETED;
    await this.prisma.catalogImportJob.update({ where: { id: jobId }, data: { status, pagesVisited: Math.max(job.pagesVisited, pages), productsSeen: seen, productsImported: imported, productsFailed: failed, lockedUntil: null, finishedAt: new Date() } });
  }

  private async cancelRequested(jobId: string) { return (await this.prisma.catalogImportJob.findUnique({ where: { id: jobId }, select: { cancelRequested: true } }))?.cancelRequested ?? true; }

  private bumpProgress(jobId: string, pages: number, seen: number, imported: number, failed: number) {
    return this.prisma.catalogImportJob.update({ where: { id: jobId }, data: { pagesVisited: pages, productsSeen: seen, productsImported: imported, productsFailed: failed, lockedUntil: new Date(Date.now() + 10 * 60_000) } });
  }

  private async ingestSnapshot(job: { id: string; targetCategoryId: string; targetBrandId: string | null }, snapshot: ItemSnapshot): Promise<"IMPORTED" | "DUPLICATE" | "NEEDS_REVIEW" | "FAILED"> {
    const sourceHash = hash(snapshot);
    const currentJobItem = await this.prisma.catalogImportItem.findUnique({ where: { jobId_sourceItemId: { jobId: job.id, sourceItemId: snapshot.sourceItemId } }, select: { sourceHash: true, status: true, productId: true } });
    if (currentJobItem?.sourceHash === sourceHash) {
      return currentJobItem.status === CatalogImportItemStatus.IMPORTED ? "DUPLICATE" : currentJobItem.status;
    }
    if (currentJobItem?.productId) {
      await this.prisma.catalogImportItem.update({ where: { jobId_sourceItemId: { jobId: job.id, sourceItemId: snapshot.sourceItemId } }, data: { pendingSnapshot: snapshot as unknown as Prisma.InputJsonValue, status: CatalogImportItemStatus.NEEDS_REVIEW, errorCode: null, errorDetail: null } });
      return "NEEDS_REVIEW";
    }
    const prior = await this.prisma.catalogImportItem.findFirst({ where: { source: "DIGIKALA", sourceItemId: snapshot.sourceItemId, productId: { not: null } }, orderBy: { createdAt: "desc" }, select: { sourceHash: true, productId: true, sourceSnapshot: true } });
    if (prior?.sourceHash === sourceHash) {
      await this.prisma.catalogImportItem.create({ data: { jobId: job.id, source: "DIGIKALA", sourceItemId: snapshot.sourceItemId, sourceUrl: snapshot.sourceUrl, sourceSnapshot: snapshot as unknown as Prisma.InputJsonValue, sourceHash, productId: prior.productId, status: CatalogImportItemStatus.DUPLICATE } });
      return "DUPLICATE";
    }
    if (prior?.productId) {
      await this.prisma.catalogImportItem.create({ data: { jobId: job.id, source: "DIGIKALA", sourceItemId: snapshot.sourceItemId, sourceUrl: snapshot.sourceUrl, sourceSnapshot: prior.sourceSnapshot as Prisma.InputJsonValue, pendingSnapshot: snapshot as unknown as Prisma.InputJsonValue, sourceHash, productId: prior.productId, status: CatalogImportItemStatus.NEEDS_REVIEW } });
      return "NEEDS_REVIEW";
    }
    if (snapshot.images.length < 3) {
      await this.prisma.catalogImportItem.create({ data: { jobId: job.id, source: "DIGIKALA", sourceItemId: snapshot.sourceItemId, sourceUrl: snapshot.sourceUrl, sourceSnapshot: snapshot as unknown as Prisma.InputJsonValue, sourceHash, status: CatalogImportItemStatus.NEEDS_REVIEW, errorCode: "THREE_IMAGES_REQUIRED", errorDetail: `Only ${snapshot.images.length} source images were found; C-03 requires exactly 3 catalog images.` } });
      return "NEEDS_REVIEW";
    }
    const productId = randomUUID();
    const stored: Array<{ url: string; alt: string | null; key: string }> = [];
    try {
      for (const image of snapshot.images.slice(0, 3)) {
        const imageUrl = new URL(image.url);
        const robots = await this.robotsFor(imageUrl);
        if (robotsDisallowsPath(robots, `${imageUrl.pathname}${imageUrl.search}`, CRAWLER)) throw new CatalogImportBlockedError("Source robots.txt disallows an image URL.");
        const response = await safeFetch(image.url, HOSTS, { timeoutMs: 10_000, maxBytes: MAX_IMAGE_BYTES, accept: "image/jpeg,image/png,image/webp", includeBytes: true });
        const mime = mimeOf(response.bodyBytes);
        if (!mime || !response.contentType?.toLowerCase().startsWith(mime)) throw new CatalogImportBlockedError("Source image has an unsupported or mismatched content type.");
        const media = await this.storage.storeCatalogImage(productId, mime, response.bodyBytes);
        stored.push({ url: media.url, key: media.key, alt: image.alt });
      }
      const slug = `digikala-${snapshot.sourceItemId}`;
      await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.create({ data: {
          id: productId, title: snapshot.title, slug, description: snapshot.description,
          specifications: snapshot.specifications as unknown as Prisma.InputJsonValue,
          categoryId: job.targetCategoryId, brandId: job.targetBrandId, status: ProductStatus.DRAFT,
          media: { create: stored.map(({ url, alt }, sortOrder) => ({ url, alt, sortOrder, sourceUrl: snapshot.images[sortOrder]?.url ?? null })) },
        }, select: { id: true } });
        await tx.catalogImportItem.create({ data: { jobId: job.id, source: "DIGIKALA", sourceItemId: snapshot.sourceItemId, sourceUrl: snapshot.sourceUrl, sourceSnapshot: snapshot as unknown as Prisma.InputJsonValue, sourceHash, productId: product.id, status: CatalogImportItemStatus.IMPORTED } });
      });
      return "IMPORTED";
    } catch (e) {
      await this.prisma.product.deleteMany({ where: { id: productId } });
      await Promise.all(stored.map((media) => this.storage.deleteCatalogImage(media.key).catch(() => undefined)));
      throw e;
    }
  }

  /** Pause between Digikala requests (fair use); 0 in tests. */
  factsDelayMs = process.env.NODE_ENV === "test" ? 0 : 3_000;

  /**
   * Queues the one-time Digikala pet import, facts only (owner decision 2026-11-12). Refused once a facts run has
   * finished or is under way, so it really happens once; a failed or cancelled run may be queued again.
   */
  async createFactsJob(admin: ResolvedAdminContext, input: { categoryId: string; brandId?: string; maxProducts?: number; idempotencyKey: string }, requestId?: string) {
    const prior = await this.prisma.catalogImportJob.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (prior) return prior;
    const category = await this.prisma.productCategory.findFirst({ where: { id: input.categoryId, status: "ACTIVE" }, select: { id: true } });
    if (!category) throw new NotFoundApiException("Active product category", { categoryId: input.categoryId });
    if (input.brandId) {
      const brand = await this.prisma.brand.findFirst({ where: { id: input.brandId, status: "ACTIVE" }, select: { id: true } });
      if (!brand) throw new NotFoundApiException("Active brand", { brandId: input.brandId });
    }
    const existing = await this.prisma.catalogImportJob.findFirst({ where: { mode: DIGIKALA_FACTS_MODE, status: { in: [CatalogImportJobStatus.QUEUED, CatalogImportJobStatus.RUNNING, CatalogImportJobStatus.COMPLETED, CatalogImportJobStatus.PARTIAL] } }, select: { id: true } });
    if (existing) throw new ApiException("DIGIKALA_FACTS_ALREADY_RUN", "The one-time Digikala facts import has already run or is running.", HttpStatus.CONFLICT, { jobId: existing.id });
    const maxProducts = Math.min(FACTS_MAX_PRODUCTS, Math.max(1, input.maxProducts ?? FACTS_DEFAULT_PRODUCTS));
    const row = await this.prisma.catalogImportJob.create({ data: {
      mode: DIGIKALA_FACTS_MODE, submittedUrls: [factsListUrl(1)], targetCategoryId: category.id, targetBrandId: input.brandId ?? null,
      maxPages: FACTS_MAX_PAGES, maxProducts, requestedById: admin.adminUserId, idempotencyKey: input.idempotencyKey,
    } });
    await this.audit.record({ adminUserId: admin.adminUserId, action: "catalog_import.queued", entityType: "CATALOG_IMPORT_JOB", entityId: row.id, afterSummary: { mode: DIGIKALA_FACTS_MODE, categoryId: row.targetCategoryId, maxProducts }, requestId });
    return row;
  }

  private async fetchFactsJson(url: string): Promise<unknown> {
    if (this.factsDelayMs) await new Promise((resolve) => setTimeout(resolve, this.factsDelayMs));
    const response = await safeFetch(url, DIGIKALA_FACTS_HOSTS, { timeoutMs: 15_000, maxBytes: 3_000_000, accept: "application/json" });
    let body: unknown;
    try { body = JSON.parse(response.body); } catch { throw new CatalogImportBlockedError("Digikala did not return JSON; import stopped."); }
    const status = (body as { status?: unknown } | null)?.status;
    if (typeof status === "number" && status !== 200) throw new CatalogImportBlockedError(`Digikala answered status ${status}; import stopped.`);
    return body;
  }

  /** Same name (Persian or English) as an active opetlife brand, or nothing; brands are never created here. */
  private async matchBrand(snapshot: DigikalaFactsSnapshot): Promise<string | null> {
    const names = [snapshot.brandName, snapshot.brandNameEn].filter((n): n is string => !!n);
    if (!names.length) return null;
    const brand = await this.prisma.brand.findFirst({ where: { status: "ACTIVE", OR: names.map((name) => ({ name: { equals: name, mode: "insensitive" as const } })) }, select: { id: true } });
    return brand?.id ?? null;
  }

  private async ingestFacts(job: { id: string; targetCategoryId: string; targetBrandId: string | null }, snapshot: DigikalaFactsSnapshot): Promise<"IMPORTED" | "DUPLICATE"> {
    const brandId = job.targetBrandId ?? (await this.matchBrand(snapshot));
    // An unmatched brand stays visible to staff as a spec until they add the brand.
    const specifications = !brandId && snapshot.brandName ? [{ label: "برند", value: snapshot.brandName }, ...snapshot.specifications] : snapshot.specifications;
    try {
      await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.create({ data: {
          title: snapshot.title, slug: `digikala-${snapshot.sourceItemId}`, description: null,
          specifications: specifications as unknown as Prisma.InputJsonValue,
          categoryId: job.targetCategoryId, brandId, status: ProductStatus.DRAFT,
          supportsDog: snapshot.supportsDog, supportsCat: snapshot.supportsCat,
          variants: { create: { sku: `DK-${snapshot.sourceItemId}`, ...(snapshot.weightKg ? { weightValue: snapshot.weightKg, weightUnit: WeightUnit.KG } : {}) } },
        }, select: { id: true } });
        await tx.catalogImportItem.create({ data: { jobId: job.id, source: "DIGIKALA", sourceItemId: snapshot.sourceItemId, sourceUrl: snapshot.sourceUrl, sourceSnapshot: snapshot as unknown as Prisma.InputJsonValue, sourceHash: hash(snapshot), productId: product.id, status: CatalogImportItemStatus.IMPORTED } });
      });
      return "IMPORTED";
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      await this.prisma.catalogImportItem.create({ data: { jobId: job.id, source: "DIGIKALA", sourceItemId: snapshot.sourceItemId, sourceUrl: snapshot.sourceUrl, sourceSnapshot: snapshot as unknown as Prisma.InputJsonValue, sourceHash: hash(snapshot), status: CatalogImportItemStatus.DUPLICATE, errorCode: "ALREADY_IN_CATALOG" } }).catch(() => undefined);
      return "DUPLICATE";
    }
  }

  /**
   * Walks Digikala's pet category best-sellers page by page and reads each product's facts. Resumes after a retry
   * (products already recorded are skipped). A 403/429/captcha/non-JSON answer stops the run; nothing is retried
   * around a block.
   */
  private async runFactsJob(jobId: string) {
    const job = await this.prisma.catalogImportJob.findUniqueOrThrow({ where: { id: jobId } });
    let page = Math.max(1, job.pagesVisited);
    let pages = job.pagesVisited;
    let seen = job.productsSeen;
    let failed = job.productsFailed;
    let lastPage = job.maxPages;
    while (seen < job.maxProducts && page <= lastPage) {
      const list = parseFactsList(await this.fetchFactsJson(factsListUrl(page)));
      if (list.totalPages) lastPage = Math.min(lastPage, list.totalPages);
      pages = Math.max(pages, page);
      if (!list.items.length) break;
      for (const ref of list.items) {
        if (seen >= job.maxProducts) break;
        const known = await this.prisma.catalogImportItem.findFirst({ where: { source: "DIGIKALA", sourceItemId: ref.id }, select: { id: true } });
        if (known) continue;
        seen++;
        try {
          const snapshot = parseFactsDetail(await this.fetchFactsJson(factsDetailUrl(ref.id)), ref);
          if (!snapshot) {
            failed++;
            await this.prisma.catalogImportItem.create({ data: { jobId, source: "DIGIKALA", sourceItemId: ref.id, sourceUrl: `https://www.digikala.com/product/dkp-${ref.id}/`, sourceSnapshot: ref as unknown as Prisma.InputJsonValue, sourceHash: hash(ref), status: CatalogImportItemStatus.FAILED, errorCode: "UNREADABLE_PRODUCT" } }).catch(() => undefined);
          } else {
            await this.ingestFacts(job, snapshot);
          }
        } catch (e) {
          failed++;
          const detail = e instanceof Error ? e.message.slice(0, 250) : "unknown";
          await this.prisma.catalogImportItem.create({ data: { jobId, source: "DIGIKALA", sourceItemId: ref.id, sourceUrl: `https://www.digikala.com/product/dkp-${ref.id}/`, sourceSnapshot: ref as unknown as Prisma.InputJsonValue, sourceHash: hash(ref), status: CatalogImportItemStatus.FAILED, errorCode: "IMPORT_ITEM_FAILED", errorDetail: detail } }).catch(() => undefined);
          if (e instanceof CatalogImportBlockedError || (e instanceof SourceFetchError && ["BLOCKED_BY_SOURCE", "RATE_LIMITED"].includes(e.category))) throw e;
        }
        const imported = await this.prisma.catalogImportItem.count({ where: { jobId, status: CatalogImportItemStatus.IMPORTED } });
        await this.bumpProgress(jobId, pages, seen, imported, failed);
        if (await this.cancelRequested(jobId)) break;
      }
      if (await this.cancelRequested(jobId)) break;
      page++;
    }
    const cancelled = await this.cancelRequested(jobId);
    const imported = await this.prisma.catalogImportItem.count({ where: { jobId, status: CatalogImportItemStatus.IMPORTED } });
    const status = cancelled ? CatalogImportJobStatus.CANCELLED : imported === 0 ? CatalogImportJobStatus.FAILED : failed > 0 ? CatalogImportJobStatus.PARTIAL : CatalogImportJobStatus.COMPLETED;
    await this.prisma.catalogImportJob.update({ where: { id: jobId }, data: { status, pagesVisited: pages, productsSeen: seen, productsImported: imported, productsFailed: failed, lockedUntil: null, finishedAt: new Date() } });
  }

  async applyIncomingSnapshot(admin: ResolvedAdminContext, itemId: string, reason: string, requestId?: string) {
    const item = await this.prisma.catalogImportItem.findUnique({ where: { id: itemId } });
    if (!item || !item.productId || !item.pendingSnapshot) throw new NotFoundApiException("Pending catalog source update", { itemId });
    const next = item.pendingSnapshot as unknown as ItemSnapshot;
    const before = await this.prisma.product.findUnique({ where: { id: item.productId }, select: { title: true, description: true, specifications: true } });
    if (!before) throw new NotFoundApiException("Product", { productId: item.productId });
    await this.prisma.product.update({ where: { id: item.productId }, data: { title: next.title, description: next.description, specifications: next.specifications as unknown as Prisma.InputJsonValue } });
    await this.prisma.catalogImportItem.update({ where: { id: itemId }, data: { sourceSnapshot: item.pendingSnapshot as Prisma.InputJsonValue, pendingSnapshot: Prisma.DbNull, sourceHash: hash(next), status: CatalogImportItemStatus.IMPORTED } });
    await this.audit.record({ adminUserId: admin.adminUserId, action: "catalog_import.apply_source_update", entityType: "CATALOG_IMPORT_ITEM", entityId: itemId, reason, beforeSummary: before, afterSummary: { title: next.title, description: next.description }, requestId });
    return { id: itemId, productId: item.productId, status: CatalogImportItemStatus.IMPORTED };
  }

  async rejectIncomingSnapshot(admin: ResolvedAdminContext, itemId: string, reason: string, requestId?: string) {
    const item = await this.prisma.catalogImportItem.findUnique({ where: { id: itemId }, select: { id: true, pendingSnapshot: true } });
    if (!item || !item.pendingSnapshot) throw new NotFoundApiException("Pending catalog source update", { itemId });
    await this.prisma.catalogImportItem.update({ where: { id: itemId }, data: { pendingSnapshot: Prisma.DbNull, status: CatalogImportItemStatus.DUPLICATE, errorCode: "SOURCE_UPDATE_REJECTED", errorDetail: reason } });
    await this.audit.record({ adminUserId: admin.adminUserId, action: "catalog_import.reject_source_update", entityType: "CATALOG_IMPORT_ITEM", entityId: itemId, reason, beforeSummary: { pendingSnapshot: true }, afterSummary: { pendingSnapshot: false }, requestId });
    return { id: itemId, status: CatalogImportItemStatus.DUPLICATE };
  }
}
