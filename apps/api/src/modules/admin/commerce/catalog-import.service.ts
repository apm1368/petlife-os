import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { AdminPriority, AdminTaskSource, CatalogImportItemStatus, CatalogImportJobStatus, Prisma, ProductStatus } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ApiException, NotFoundApiException } from "../../../common/errors/api-exception";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import { AutomaticTaskService } from "../task/automatic-task.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { StorageService } from "../../storage/storage.service";
import { safeFetch, SourceFetchError } from "../../travel-external/safe-fetch";
import { canonicalDigikalaInput, parseDigikalaCatalogPage, type DigikalaProductSnapshot } from "./digikala-catalog.parser";
import { robotsDisallowsPath } from "./digikala-robots";

const HOSTS = ["digikala.com"];
const MAX_URLS = 20;
const MAX_PAGES = 10;
const MAX_PRODUCTS = 100;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const CRAWLER = "PetLifeDemoTravelCrawler";
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
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService, private readonly audit: AdminAuditLogService, private readonly tasks: AutomaticTaskService) {}

  async createJob(admin: ResolvedAdminContext, input: JobInput, requestId?: string) {
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
    const candidate = await this.prisma.catalogImportJob.findFirst({ where: { OR: [
      { status: CatalogImportJobStatus.QUEUED, nextAttemptAt: { lte: now } },
      { status: CatalogImportJobStatus.RUNNING, lockedUntil: { lt: now } },
    ] }, orderBy: { createdAt: "asc" } });
    if (!candidate) return false;
    const claimWhere = candidate.status === CatalogImportJobStatus.QUEUED
      ? { id: candidate.id, status: CatalogImportJobStatus.QUEUED, nextAttemptAt: { lte: now } }
      : { id: candidate.id, status: CatalogImportJobStatus.RUNNING, lockedUntil: { lt: now } };
    const locked = await this.prisma.catalogImportJob.updateMany({ where: claimWhere, data: { status: CatalogImportJobStatus.RUNNING, startedAt: now, lockedUntil: new Date(now.getTime() + 10 * 60_000), attempt: { increment: 1 }, lastError: null } });
    if (!locked.count) return false;
    try {
      await this.runJob(candidate.id);
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
