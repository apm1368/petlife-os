import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  AdminReportBreakdownRowDto,
  AdminReportCohortDto,
  AdminReportGranularity,
  AdminReportKpiDto,
  AdminReportOverviewDto,
  AdminReportSeriesPointDto,
  AdminReportTopRowDto,
} from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { adminCan } from "../auth/admin-permissions";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { CUSTOMER_METRIC_CTES, CUSTOMER_METRIC_JOINS, LIVE_BOOKING, LIVE_ORDER, LIVE_STAY, SEGMENTS, customerMetricColumns } from "./customer-metrics.sql";
import { bucketKeys, delta, resolveReportRange, type ResolvedReportRange } from "./report-range";

type Window = { start: Date; end: Date };
type Totals = {
  newUsers: number;
  activeUsers: number;
  buyers: number;
  repeatBuyers: number;
  orders: number;
  gmv: number;
  cancelledOrders: number;
  allOrders: number;
  serviceBookings: number;
  travelBookings: number;
  bookingValue: number;
  cancelledBookings: number;
  allBookings: number;
  supportCases: number;
};

const n = (value: bigint | number | null | undefined) => Number(value ?? 0);
/** Wall-clock Tehran timestamp of a UTC column, so buckets and cohorts follow the local calendar. */
const local = (column: Prisma.Sql) => Prisma.sql`(${column} + interval '3 hours 30 minutes')`;
const bucketOf = (column: Prisma.Sql, g: AdminReportGranularity) =>
  Prisma.sql`to_char(date_trunc(${g}, ${local(column)}), 'YYYY-MM-DD')`;

function kpi(value: number, previous: number): AdminReportKpiDto {
  return { value, previous, change: delta(value, previous) };
}

/**
 * ERP reports. Every number is a live aggregate over the operational tables, computed in PostgreSQL for the
 * requested Tehran-calendar window and the same-length window before it. Nothing is cached or sampled, and
 * every definition (what counts as an order, a booking, a cancellation) is the one in customer-metrics.sql.ts.
 */
@Injectable()
export class AdminReportsService {
  constructor(private readonly prisma: PrismaService) {}

  resolveRange(input: { from?: string; to?: string; granularity?: AdminReportGranularity }) {
    return resolveReportRange(input);
  }

  async overview(admin: ResolvedAdminContext, range: ResolvedReportRange, now = new Date()): Promise<AdminReportOverviewDto> {
    const current: Window = { start: range.startUtc, end: range.endUtc };
    const previous: Window = { start: range.previousStartUtc, end: range.previousEndUtc };
    const canSeeCustomers = adminCan(admin, "customer.view");
    const [cur, prev, series, breakdowns, funnel, sellers, providers, products, customers, segments, cohorts] = await Promise.all([
      this.totals(current),
      this.totals(previous),
      this.series(range),
      this.breakdowns(current),
      this.funnel(current),
      this.topSellers(current),
      this.topProviders(current),
      this.topProducts(current),
      canSeeCustomers ? this.topCustomers(current) : Promise.resolve(null),
      this.segmentBreakdown(now),
      this.cohorts(range, now),
    ]);
    const aov = (t: Totals) => (t.orders ? Math.round(t.gmv / t.orders) : 0);
    const rate = (part: number, whole: number) => (whole ? part / whole : 0);
    return {
      range: {
        from: range.from,
        to: range.to,
        previousFrom: range.previousFrom,
        previousTo: range.previousTo,
        granularity: range.granularity,
        days: range.days,
        timezone: "Asia/Tehran",
        generatedAt: now.toISOString(),
      },
      kpis: {
        newUsers: kpi(cur.newUsers, prev.newUsers),
        activeUsers: kpi(cur.activeUsers, prev.activeUsers),
        buyers: kpi(cur.buyers, prev.buyers),
        orders: kpi(cur.orders, prev.orders),
        gmv: kpi(cur.gmv, prev.gmv),
        averageOrderValue: kpi(aov(cur), aov(prev)),
        serviceBookings: kpi(cur.serviceBookings, prev.serviceBookings),
        travelBookings: kpi(cur.travelBookings, prev.travelBookings),
        bookingValue: kpi(cur.bookingValue, prev.bookingValue),
        cancellationRate: kpi(
          rate(cur.cancelledOrders + cur.cancelledBookings, cur.allOrders + cur.allBookings),
          rate(prev.cancelledOrders + prev.cancelledBookings, prev.allOrders + prev.allBookings),
        ),
        repeatBuyerRate: kpi(rate(cur.repeatBuyers, cur.buyers), rate(prev.repeatBuyers, prev.buyers)),
        supportCases: kpi(cur.supportCases, prev.supportCases),
      },
      series,
      breakdowns: { ...breakdowns, customerSegments: segments },
      funnel,
      top: { sellers, providers, products, customers },
      cohorts,
    };
  }

  private async totals({ start, end }: Window): Promise<Totals> {
    const inRange = (column: Prisma.Sql) => Prisma.sql`${column} >= ${start} AND ${column} < ${end}`;
    const [row] = await this.prisma.$queryRaw<Array<Record<keyof Totals, bigint | number | null>>>(Prisma.sql`
      SELECT
        (SELECT COUNT(*) FROM users u WHERE ${inRange(Prisma.sql`u."createdAt"`)}) AS "newUsers",
        (SELECT COUNT(DISTINCT s."userId") FROM sessions s
          WHERE s."lastSeenAt" >= ${start} AND s."createdAt" < ${end}) AS "activeUsers",
        (SELECT COUNT(*) FROM (SELECT o."userId" FROM orders o
          WHERE o."checkoutId" IS NOT NULL AND o."userId" IS NOT NULL AND ${LIVE_ORDER} AND ${inRange(Prisma.sql`o."createdAt"`)}
          GROUP BY 1) x) AS "buyers",
        (SELECT COUNT(*) FROM (SELECT o."userId" FROM orders o
          WHERE o."checkoutId" IS NOT NULL AND o."userId" IS NOT NULL AND ${LIVE_ORDER} AND ${inRange(Prisma.sql`o."createdAt"`)}
          GROUP BY 1 HAVING COUNT(*) >= 2) x) AS "repeatBuyers",
        (SELECT COUNT(*) FROM orders o WHERE o."checkoutId" IS NOT NULL AND ${LIVE_ORDER} AND ${inRange(Prisma.sql`o."createdAt"`)}) AS "orders",
        (SELECT COALESCE(SUM(o."totalAmount"), 0) FROM orders o WHERE o."checkoutId" IS NOT NULL AND ${LIVE_ORDER} AND ${inRange(Prisma.sql`o."createdAt"`)}) AS "gmv",
        (SELECT COUNT(*) FROM orders o WHERE o."checkoutId" IS NOT NULL AND o.status::text = 'CANCELLED' AND ${inRange(Prisma.sql`o."createdAt"`)}) AS "cancelledOrders",
        (SELECT COUNT(*) FROM orders o WHERE o."checkoutId" IS NOT NULL AND ${inRange(Prisma.sql`o."createdAt"`)}) AS "allOrders",
        (SELECT COUNT(*) FROM bookings b WHERE ${LIVE_BOOKING} AND ${inRange(Prisma.sql`b."createdAt"`)}) AS "serviceBookings",
        (SELECT COUNT(*) FROM travel_bookings t WHERE ${LIVE_STAY} AND ${inRange(Prisma.sql`t."createdAt"`)}) AS "travelBookings",
        (SELECT COALESCE(SUM(COALESCE(b."priceAmount", 0) - b."discountAmount"), 0) FROM bookings b
          WHERE ${LIVE_BOOKING} AND COALESCE(b.currency, 'IRR') = 'IRR' AND ${inRange(Prisma.sql`b."createdAt"`)})
          + (SELECT COALESCE(SUM(t."totalAmountIrr"), 0) FROM travel_bookings t WHERE ${LIVE_STAY} AND ${inRange(Prisma.sql`t."createdAt"`)}) AS "bookingValue",
        (SELECT COUNT(*) FROM bookings b WHERE b."bookingStatus"::text IN ('CANCELLED_BY_USER', 'CANCELLED_BY_PROVIDER') AND ${inRange(Prisma.sql`b."createdAt"`)})
          + (SELECT COUNT(*) FROM travel_bookings t WHERE t.status::text = 'CANCELLED' AND ${inRange(Prisma.sql`t."createdAt"`)}) AS "cancelledBookings",
        (SELECT COUNT(*) FROM bookings b WHERE (${LIVE_BOOKING} OR b."bookingStatus"::text IN ('CANCELLED_BY_USER', 'CANCELLED_BY_PROVIDER')) AND ${inRange(Prisma.sql`b."createdAt"`)})
          + (SELECT COUNT(*) FROM travel_bookings t WHERE (${LIVE_STAY} OR t.status::text = 'CANCELLED') AND ${inRange(Prisma.sql`t."createdAt"`)}) AS "allBookings",
        (SELECT COUNT(*) FROM support_cases sc WHERE ${inRange(Prisma.sql`sc."createdAt"`)}) AS "supportCases"
    `);
    const out = {} as Totals;
    for (const key of Object.keys(row ?? {}) as (keyof Totals)[]) out[key] = n(row?.[key]);
    return out;
  }

  private async series(range: ResolvedReportRange): Promise<AdminReportSeriesPointDto[]> {
    const g = range.granularity;
    const start = range.startUtc;
    const end = range.endUtc;
    const [users, active, orders, bookings, stays] = await Promise.all([
      this.prisma.$queryRaw<{ bucket: string; c: bigint }[]>(Prisma.sql`
        SELECT ${bucketOf(Prisma.sql`u."createdAt"`, g)} AS bucket, COUNT(*) AS c FROM users u
        WHERE u."createdAt" >= ${start} AND u."createdAt" < ${end} GROUP BY 1`),
      // A session is "active in a bucket" in the bucket of its last activity — a lower bound, never double counted.
      this.prisma.$queryRaw<{ bucket: string; c: bigint }[]>(Prisma.sql`
        SELECT ${bucketOf(Prisma.sql`s."lastSeenAt"`, g)} AS bucket, COUNT(DISTINCT s."userId") AS c FROM sessions s
        WHERE s."lastSeenAt" >= ${start} AND s."lastSeenAt" < ${end} GROUP BY 1`),
      this.prisma.$queryRaw<{ bucket: string; c: bigint; amount: bigint | null }[]>(Prisma.sql`
        SELECT ${bucketOf(Prisma.sql`o."createdAt"`, g)} AS bucket, COUNT(*) AS c, SUM(o."totalAmount") AS amount FROM orders o
        WHERE o."checkoutId" IS NOT NULL AND ${LIVE_ORDER} AND o."createdAt" >= ${start} AND o."createdAt" < ${end} GROUP BY 1`),
      this.prisma.$queryRaw<{ bucket: string; c: bigint; amount: Prisma.Decimal | null }[]>(Prisma.sql`
        SELECT ${bucketOf(Prisma.sql`b."createdAt"`, g)} AS bucket, COUNT(*) AS c,
          SUM(COALESCE(b."priceAmount", 0) - b."discountAmount") FILTER (WHERE COALESCE(b.currency, 'IRR') = 'IRR') AS amount
        FROM bookings b WHERE ${LIVE_BOOKING} AND b."createdAt" >= ${start} AND b."createdAt" < ${end} GROUP BY 1`),
      this.prisma.$queryRaw<{ bucket: string; c: bigint; amount: bigint | null }[]>(Prisma.sql`
        SELECT ${bucketOf(Prisma.sql`t."createdAt"`, g)} AS bucket, COUNT(*) AS c, SUM(t."totalAmountIrr") AS amount FROM travel_bookings t
        WHERE ${LIVE_STAY} AND t."createdAt" >= ${start} AND t."createdAt" < ${end} GROUP BY 1`),
    ]);
    const points = new Map<string, AdminReportSeriesPointDto>(
      bucketKeys(range).map((bucket) => [
        bucket,
        { bucket, newUsers: 0, activeUsers: 0, orders: 0, gmv: 0, serviceBookings: 0, travelBookings: 0, bookingValue: 0 },
      ]),
    );
    const at = (bucket: string) => points.get(bucket);
    for (const r of users) { const p = at(r.bucket); if (p) p.newUsers = n(r.c); }
    for (const r of active) { const p = at(r.bucket); if (p) p.activeUsers = n(r.c); }
    for (const r of orders) { const p = at(r.bucket); if (p) { p.orders = n(r.c); p.gmv = n(r.amount); } }
    for (const r of bookings) { const p = at(r.bucket); if (p) { p.serviceBookings = n(r.c); p.bookingValue += Math.round(Number(r.amount ?? 0)); } }
    for (const r of stays) { const p = at(r.bucket); if (p) { p.travelBookings = n(r.c); p.bookingValue += n(r.amount); } }
    return [...points.values()];
  }

  private async breakdowns({ start, end }: Window) {
    const [orderStatus, serviceCategory, serviceStatus, travelStatus] = await Promise.all([
      this.prisma.$queryRaw<{ key: string; c: bigint; amount: bigint | null }[]>(Prisma.sql`
        SELECT o.status::text AS key, COUNT(*) AS c, SUM(o."totalAmount") AS amount FROM orders o
        WHERE o."checkoutId" IS NOT NULL AND o."createdAt" >= ${start} AND o."createdAt" < ${end} GROUP BY 1 ORDER BY 2 DESC`),
      this.prisma.$queryRaw<{ key: string; c: bigint; amount: Prisma.Decimal | null }[]>(Prisma.sql`
        SELECT b.category::text AS key, COUNT(*) AS c, SUM(COALESCE(b."priceAmount", 0) - b."discountAmount") AS amount FROM bookings b
        WHERE ${LIVE_BOOKING} AND b."createdAt" >= ${start} AND b."createdAt" < ${end} GROUP BY 1 ORDER BY 2 DESC`),
      this.prisma.$queryRaw<{ key: string; c: bigint }[]>(Prisma.sql`
        SELECT b."bookingStatus"::text AS key, COUNT(*) AS c FROM bookings b
        WHERE b."createdAt" >= ${start} AND b."createdAt" < ${end} GROUP BY 1 ORDER BY 2 DESC`),
      this.prisma.$queryRaw<{ key: string; c: bigint }[]>(Prisma.sql`
        SELECT t.status::text AS key, COUNT(*) AS c FROM travel_bookings t
        WHERE t.status::text <> 'DRAFT' AND t."createdAt" >= ${start} AND t."createdAt" < ${end} GROUP BY 1 ORDER BY 2 DESC`),
    ]);
    const rows = (list: { key: string; c: bigint; amount?: bigint | Prisma.Decimal | null }[]): AdminReportBreakdownRowDto[] =>
      list.map((r) => ({ key: r.key, count: n(r.c), ...(r.amount !== undefined ? { amount: Math.round(Number(r.amount ?? 0)) } : {}) }));
    return {
      orderStatus: rows(orderStatus),
      serviceCategory: rows(serviceCategory),
      serviceStatus: rows(serviceStatus),
      travelStatus: rows(travelStatus),
    };
  }

  private async funnel({ start, end }: Window) {
    const [row] = await this.prisma.$queryRaw<Array<{ carts: bigint; checkouts: bigint; orders: bigint; fulfilled: bigint }>>(Prisma.sql`
      SELECT
        (SELECT COUNT(*) FROM carts c WHERE c."createdAt" >= ${start} AND c."createdAt" < ${end}) AS carts,
        (SELECT COUNT(*) FROM checkouts k WHERE k."createdAt" >= ${start} AND k."createdAt" < ${end}) AS checkouts,
        (SELECT COUNT(*) FROM orders o WHERE o."checkoutId" IS NOT NULL AND ${LIVE_ORDER} AND o."createdAt" >= ${start} AND o."createdAt" < ${end}) AS orders,
        (SELECT COUNT(*) FROM orders o WHERE o."checkoutId" IS NOT NULL AND o.status::text = 'FULFILLED' AND o."createdAt" >= ${start} AND o."createdAt" < ${end}) AS fulfilled
    `);
    return { carts: n(row?.carts), checkouts: n(row?.checkouts), orders: n(row?.orders), fulfilled: n(row?.fulfilled) };
  }

  private top(rows: { id: string; name: string | null; c: bigint | number; amount: bigint | number | Prisma.Decimal | null }[]): AdminReportTopRowDto[] {
    return rows.map((r) => ({ id: r.id, name: r.name ?? "", count: n(r.c as bigint), amount: Math.round(Number(r.amount ?? 0)) }));
  }

  private async topSellers({ start, end }: Window) {
    return this.top(await this.prisma.$queryRaw(Prisma.sql`
      SELECT so.id, so.name, COUNT(o.id) AS c, SUM(o."totalAmount") AS amount
      FROM orders o JOIN seller_organizations so ON so.id = o."sellerOrganizationId"
      WHERE o."checkoutId" IS NOT NULL AND ${LIVE_ORDER} AND o."createdAt" >= ${start} AND o."createdAt" < ${end}
      GROUP BY so.id, so.name ORDER BY amount DESC NULLS LAST, so.id LIMIT 8`));
  }

  private async topProviders({ start, end }: Window) {
    return this.top(await this.prisma.$queryRaw(Prisma.sql`
      SELECT p.id, p.name, COUNT(b.id) AS c, SUM(COALESCE(b."priceAmount", 0) - b."discountAmount") AS amount
      FROM bookings b JOIN provider_organizations p ON p.id = b."providerOrganizationId"
      WHERE ${LIVE_BOOKING} AND b."createdAt" >= ${start} AND b."createdAt" < ${end}
      GROUP BY p.id, p.name ORDER BY c DESC, p.id LIMIT 8`));
  }

  private async topProducts({ start, end }: Window) {
    return this.top(await this.prisma.$queryRaw(Prisma.sql`
      SELECT oi."productId" AS id, MIN(oi."productTitleSnapshot") AS name, SUM(oi.quantity) AS c, SUM(oi."totalPrice") AS amount
      FROM order_items oi JOIN orders o ON o.id = oi."orderId"
      WHERE o."checkoutId" IS NOT NULL AND ${LIVE_ORDER} AND o."createdAt" >= ${start} AND o."createdAt" < ${end}
      GROUP BY oi."productId" ORDER BY c DESC, oi."productId" LIMIT 8`));
  }

  /** Spend across shop, services and stays inside the window. Identity is the display name only — no contact data. */
  private async topCustomers({ start, end }: Window) {
    return this.top(await this.prisma.$queryRaw(Prisma.sql`
      WITH spend AS (
        SELECT o."userId" AS uid, COUNT(*) AS c, SUM(o."totalAmount")::numeric AS amount FROM orders o
          WHERE o."userId" IS NOT NULL AND o."checkoutId" IS NOT NULL AND ${LIVE_ORDER} AND o."createdAt" >= ${start} AND o."createdAt" < ${end} GROUP BY 1
        UNION ALL
        SELECT b."userId", COUNT(*), SUM(COALESCE(b."priceAmount", 0) - b."discountAmount") FROM bookings b
          WHERE ${LIVE_BOOKING} AND b."createdAt" >= ${start} AND b."createdAt" < ${end} GROUP BY 1
        UNION ALL
        SELECT t."bookedByUserId", COUNT(*), SUM(t."totalAmountIrr")::numeric FROM travel_bookings t
          WHERE ${LIVE_STAY} AND t."createdAt" >= ${start} AND t."createdAt" < ${end} GROUP BY 1
      )
      SELECT u.id, u."displayName" AS name, SUM(s.c) AS c, SUM(s.amount) AS amount
      FROM spend s JOIN users u ON u.id = s.uid
      GROUP BY u.id, u."displayName" ORDER BY amount DESC NULLS LAST, u.id LIMIT 8`));
  }

  /** Every customer's segment today (independent of the window): the size of each behaviour group. */
  private async segmentBreakdown(now: Date): Promise<AdminReportBreakdownRowDto[]> {
    const rows = await this.prisma.$queryRaw<{ key: string; c: bigint; amount: bigint | null }[]>(Prisma.sql`
      WITH ${CUSTOMER_METRIC_CTES}
      SELECT x.segment AS key, COUNT(*) AS c, SUM(x."totalSpend") AS amount FROM (
        SELECT ${customerMetricColumns(now)} FROM users u ${CUSTOMER_METRIC_JOINS}
        WHERE NOT EXISTS (SELECT 1 FROM admin_users a WHERE a."userId" = u.id)
      ) x GROUP BY 1`);
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return SEGMENTS.map((key) => ({ key, count: n(byKey.get(key)?.c), amount: n(byKey.get(key)?.amount) }));
  }

  /**
   * Purchase retention by signup month: of the people who joined in month M, the share who ordered, booked a
   * service or booked a stay in M, M+1, … Six cohorts ending with the month of `range.to`.
   */
  private async cohorts(range: ResolvedReportRange, now: Date): Promise<AdminReportCohortDto[]> {
    const [y, m] = range.to.split("-").map(Number) as [number, number];
    const lastCohort = Date.UTC(y, m - 1, 1);
    const firstCohort = Date.UTC(y, m - 6, 1);
    const firstUtc = new Date(firstCohort - 3.5 * 3_600_000);
    const endUtc = new Date(Math.min(Date.UTC(y, m, 1) - 3.5 * 3_600_000, now.getTime() + 86_400_000));
    const rows = await this.prisma.$queryRaw<{ cohort: string; offset: number; c: bigint }[]>(Prisma.sql`
      WITH cohort AS (
        SELECT u.id, date_trunc('month', ${local(Prisma.sql`u."createdAt"`)}) AS m FROM users u
        WHERE u."createdAt" >= ${firstUtc} AND u."createdAt" < ${endUtc}
          AND NOT EXISTS (SELECT 1 FROM admin_users a WHERE a."userId" = u.id)
      ),
      acts AS (
        SELECT o."userId" AS uid, date_trunc('month', ${local(Prisma.sql`o."createdAt"`)}) AS m FROM orders o
          WHERE o."userId" IS NOT NULL AND o."checkoutId" IS NOT NULL AND ${LIVE_ORDER} AND o."createdAt" >= ${firstUtc}
        UNION
        SELECT b."userId", date_trunc('month', ${local(Prisma.sql`b."createdAt"`)}) FROM bookings b
          WHERE ${LIVE_BOOKING} AND b."createdAt" >= ${firstUtc}
        UNION
        SELECT t."bookedByUserId", date_trunc('month', ${local(Prisma.sql`t."createdAt"`)}) FROM travel_bookings t
          WHERE ${LIVE_STAY} AND t."createdAt" >= ${firstUtc}
      )
      SELECT to_char(c.m, 'YYYY-MM-DD') AS cohort,
        ((EXTRACT(YEAR FROM a.m) - EXTRACT(YEAR FROM c.m)) * 12 + EXTRACT(MONTH FROM a.m) - EXTRACT(MONTH FROM c.m))::int AS "offset",
        COUNT(DISTINCT c.id) AS c
      FROM cohort c JOIN acts a ON a.uid = c.id AND a.m >= c.m
      GROUP BY 1, 2`);
    const sizes = await this.prisma.$queryRaw<{ cohort: string; size: bigint }[]>(Prisma.sql`
      SELECT to_char(date_trunc('month', ${local(Prisma.sql`u."createdAt"`)}), 'YYYY-MM-DD') AS cohort, COUNT(*) AS size FROM users u
      WHERE u."createdAt" >= ${firstUtc} AND u."createdAt" < ${endUtc}
        AND NOT EXISTS (SELECT 1 FROM admin_users a WHERE a."userId" = u.id)
      GROUP BY 1`);
    const sizeOf = new Map(sizes.map((s) => [s.cohort, n(s.size)]));
    const out: AdminReportCohortDto[] = [];
    for (let i = 0; i < 6; i++) {
      const cohortMs = Date.UTC(y, m - 6 + i, 1);
      if (cohortMs < firstCohort || cohortMs > lastCohort) continue;
      const cohort = new Date(cohortMs).toISOString().slice(0, 10);
      const size = sizeOf.get(cohort) ?? 0;
      const months = 6 - i;
      const retention = Array.from({ length: months }, (_, offset) => {
        const hit = rows.find((r) => r.cohort === cohort && r.offset === offset);
        return size ? n(hit?.c) / size : 0;
      });
      out.push({ cohort, size, retention });
    }
    return out;
  }
}
