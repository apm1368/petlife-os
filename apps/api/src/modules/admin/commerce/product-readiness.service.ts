import { Injectable } from "@nestjs/common";
import { Prisma, ProductStatus } from "@prisma/client";
import type { AdminProductReadinessDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";

export const PRODUCT_READINESS_ISSUES = ["MEDIA_INCOMPLETE", "MISSING_BRAND", "MISSING_SPECS", "UNREVIEWED_SOURCE", "NO_LIVE_OFFER"] as const;
export type ProductReadinessIssue = (typeof PRODUCT_READINESS_ISSUES)[number];

/** C-03, the publish rule itself: exactly three images, every one with alternative text. One definition, used by the
 * activation guard and by the readiness queue, so the queue can never call a product ready that publishing refuses. */
export function mediaMeetsPublishRule(mediaCount: number, mediaWithoutAlt: number): boolean {
  return mediaCount === 3 && mediaWithoutAlt === 0;
}

type Row = {
  id: string;
  title: string;
  status: string;
  isDemoRecord: boolean;
  updatedAt: Date;
  categoryName: string;
  brandName: string | null;
  missingBrand: boolean;
  missingSpecs: boolean;
  mediaCount: number;
  mediaWithoutAlt: number;
  unreviewedSource: boolean;
  offers: number;
  liveOffers: number;
};

const PAGE_SIZE = 30;

/**
 * Shop readiness (owner, 2026-11-13, P4): every catalogue product that is not ready to sell, and why. Read-only and
 * strict. It reports; it never publishes, hides or relaxes anything. A product is listed when any of these holds:
 * - MEDIA_INCOMPLETE: not exactly three images, or an image without alternative text (the publish rule, C-03);
 * - MISSING_BRAND / MISSING_SPECS: no brand, or no factual specifications;
 * - UNREVIEWED_SOURCE: its facts came from an import that staff have not reviewed yet (still a draft, flagged for
 *   review, or a newer source snapshot waiting to be applied or rejected);
 * - NO_LIVE_OFFER: no offer a customer can buy now. The public catalogue's own conditions apply (offer ACTIVE and
 *   APPROVED, shop VERIFIED and ACTIVE) plus stock on hand.
 * Archived products are left out. Public (ACTIVE) products with a problem come first.
 */
@Injectable()
export class ProductReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  private conditions(): Record<ProductReadinessIssue, Prisma.Sql> {
    return {
      MEDIA_INCOMPLETE: Prisma.sql`("mediaCount" <> 3 OR "mediaWithoutAlt" > 0)`,
      MISSING_BRAND: Prisma.sql`"missingBrand"`,
      MISSING_SPECS: Prisma.sql`"missingSpecs"`,
      UNREVIEWED_SOURCE: Prisma.sql`"unreviewedSource"`,
      NO_LIVE_OFFER: Prisma.sql`"liveOffers" = 0`,
    };
  }

  private base(status?: ProductStatus, q?: string): Prisma.Sql {
    const statusFilter = status ? Prisma.sql`AND pr.status::text = ${status}` : Prisma.empty;
    const qFilter = q ? Prisma.sql`AND pr.title ILIKE ${`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`}` : Prisma.empty;
    return Prisma.sql`
      SELECT pr.id, pr.title, pr.status::text AS status, pr."isDemoRecord", pr."updatedAt",
        c.name AS "categoryName", b.name AS "brandName",
        (pr."brandId" IS NULL) AS "missingBrand",
        (pr.specifications IS NULL OR pr.specifications IN ('null'::jsonb, '[]'::jsonb, '{}'::jsonb)) AS "missingSpecs",
        (SELECT count(*)::int FROM product_media m WHERE m."productId" = pr.id) AS "mediaCount",
        (SELECT count(*)::int FROM product_media m WHERE m."productId" = pr.id AND coalesce(btrim(m.alt), '') = '') AS "mediaWithoutAlt",
        EXISTS (
          SELECT 1 FROM catalog_import_items i
          WHERE i."productId" = pr.id
            AND (i.status::text = 'NEEDS_REVIEW' OR (i."pendingSnapshot" IS NOT NULL AND i."pendingSnapshot" <> 'null'::jsonb) OR pr.status::text = 'DRAFT')
        ) AS "unreviewedSource",
        (SELECT count(*)::int FROM seller_offers o JOIN product_variants v ON v.id = o."productVariantId" WHERE v."productId" = pr.id) AS offers,
        (SELECT count(*)::int FROM seller_offers o
           JOIN product_variants v ON v.id = o."productVariantId"
           JOIN seller_organizations s ON s.id = o."sellerOrganizationId"
           LEFT JOIN inventory_items ii ON ii."sellerOfferId" = o.id
         WHERE v."productId" = pr.id
           AND o.status::text = 'ACTIVE' AND o."moderationStatus"::text = 'APPROVED'
           AND s."verificationStatus"::text = 'VERIFIED' AND s.status::text = 'ACTIVE'
           AND coalesce(ii."onHand", 0) - coalesce(ii.reserved, 0) > 0) AS "liveOffers"
      FROM products pr
      JOIN product_categories c ON c.id = pr."categoryId"
      LEFT JOIN brands b ON b.id = pr."brandId"
      WHERE pr.status::text <> 'ARCHIVED' ${statusFilter} ${qFilter}`;
  }

  async list(query: { issue?: ProductReadinessIssue; status?: ProductStatus; q?: string; page?: number }): Promise<AdminProductReadinessDto> {
    const page = Math.max(1, query.page ?? 1);
    const conditions = this.conditions();
    const anyIssue = Prisma.join(Object.values(conditions), " OR ");
    const where = query.issue ? conditions[query.issue] : anyIssue;
    const base = this.base(query.status, query.q?.trim() || undefined);
    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<Row[]>`
        WITH p AS (${base})
        SELECT * FROM p WHERE (${where})
        ORDER BY (status = 'ACTIVE') DESC, "updatedAt" DESC, id
        LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
      this.prisma.$queryRaw<Array<Record<string, number>>>`
        WITH p AS (${base})
        SELECT
          count(*) FILTER (WHERE ${anyIssue})::int AS "ANY",
          count(*) FILTER (WHERE ${conditions.MEDIA_INCOMPLETE})::int AS "MEDIA_INCOMPLETE",
          count(*) FILTER (WHERE ${conditions.MISSING_BRAND})::int AS "MISSING_BRAND",
          count(*) FILTER (WHERE ${conditions.MISSING_SPECS})::int AS "MISSING_SPECS",
          count(*) FILTER (WHERE ${conditions.UNREVIEWED_SOURCE})::int AS "UNREVIEWED_SOURCE",
          count(*) FILTER (WHERE ${conditions.NO_LIVE_OFFER})::int AS "NO_LIVE_OFFER"
        FROM p`,
    ]);
    const counts = countRows[0] ?? {};
    return {
      items: rows.map((r) => {
        const issues: ProductReadinessIssue[] = [];
        if (!mediaMeetsPublishRule(r.mediaCount, r.mediaWithoutAlt)) issues.push("MEDIA_INCOMPLETE");
        if (r.missingBrand) issues.push("MISSING_BRAND");
        if (r.missingSpecs) issues.push("MISSING_SPECS");
        if (r.unreviewedSource) issues.push("UNREVIEWED_SOURCE");
        if (r.liveOffers === 0) issues.push("NO_LIVE_OFFER");
        return {
          id: r.id,
          title: r.title,
          status: r.status,
          isDemoRecord: r.isDemoRecord,
          categoryName: r.categoryName,
          brandName: r.brandName,
          mediaCount: r.mediaCount,
          mediaWithoutAlt: r.mediaWithoutAlt,
          meetsPublishRule: mediaMeetsPublishRule(r.mediaCount, r.mediaWithoutAlt),
          offers: r.offers,
          liveOffers: r.liveOffers,
          issues,
          updatedAt: r.updatedAt.toISOString(),
        };
      }),
      total: query.issue ? counts[query.issue] ?? 0 : counts.ANY ?? 0,
      page,
      pageSize: PAGE_SIZE,
      counts: {
        ANY: counts.ANY ?? 0,
        MEDIA_INCOMPLETE: counts.MEDIA_INCOMPLETE ?? 0,
        MISSING_BRAND: counts.MISSING_BRAND ?? 0,
        MISSING_SPECS: counts.MISSING_SPECS ?? 0,
        UNREVIEWED_SOURCE: counts.UNREVIEWED_SOURCE ?? 0,
        NO_LIVE_OFFER: counts.NO_LIVE_OFFER ?? 0,
      },
    };
  }
}
