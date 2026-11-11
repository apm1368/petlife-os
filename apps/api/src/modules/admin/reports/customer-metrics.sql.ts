import { Prisma } from "@prisma/client";
import type { AdminCustomerSegment } from "@petlife/types";

/**
 * One definition of "what a customer has done", shared by the users directory filters, the per-user
 * behaviour panel and the segment breakdown in reports, so the three can never disagree.
 *
 * Money is IRR. An order counts once it is not CANCELLED/REFUNDED; a service booking counts once it was
 * confirmed (or later) and a stay once confirmed (or later) — holds, drafts, expiries and rejections are
 * attempts, not purchases.
 */
export const LIVE_ORDER = Prisma.sql`o.status::text NOT IN ('CANCELLED', 'REFUNDED')`;
export const LIVE_BOOKING = Prisma.sql`b."bookingStatus"::text IN ('CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW')`;
export const LIVE_STAY = Prisma.sql`t.status::text IN ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW')`;

/** Spend at or above this many rials (or this many purchases) makes an engaged customer VIP. */
export const VIP_SPEND_IRR = 50_000_000;
export const VIP_PURCHASES = 5;

/** CTEs `om`, `bm`, `tm`, `sm`, keyed by `uid`. Prepend with WITH. */
export const CUSTOMER_METRIC_CTES = Prisma.sql`
  om AS (
    SELECT o."userId" AS uid,
      COUNT(*) FILTER (WHERE ${LIVE_ORDER})::int AS orders,
      COALESCE(SUM(o."totalAmount") FILTER (WHERE ${LIVE_ORDER}), 0)::bigint AS spend,
      MAX(o."createdAt") FILTER (WHERE ${LIVE_ORDER}) AS last_order,
      COUNT(*) FILTER (WHERE o.status::text = 'CANCELLED')::int AS cancelled
    FROM orders o WHERE o."userId" IS NOT NULL AND o."checkoutId" IS NOT NULL GROUP BY 1
  ),
  bm AS (
    SELECT b."userId" AS uid,
      COUNT(*) FILTER (WHERE ${LIVE_BOOKING})::int AS bookings,
      COALESCE(SUM(COALESCE(b."priceAmount", 0) - b."discountAmount") FILTER (WHERE ${LIVE_BOOKING} AND COALESCE(b.currency, 'IRR') = 'IRR'), 0)::bigint AS spend,
      MAX(b."createdAt") FILTER (WHERE ${LIVE_BOOKING}) AS last_booking,
      COUNT(*) FILTER (WHERE b."bookingStatus"::text = 'CANCELLED_BY_USER')::int AS cancelled,
      COUNT(*) FILTER (WHERE b."bookingStatus"::text = 'NO_SHOW' AND b."noShowParty"::text = 'OWNER')::int AS no_show
    FROM bookings b GROUP BY 1
  ),
  tm AS (
    SELECT t."bookedByUserId" AS uid,
      COUNT(*) FILTER (WHERE ${LIVE_STAY})::int AS stays,
      COALESCE(SUM(t."totalAmountIrr") FILTER (WHERE ${LIVE_STAY}), 0)::bigint AS spend,
      MAX(t."createdAt") FILTER (WHERE ${LIVE_STAY}) AS last_stay,
      COUNT(*) FILTER (WHERE t.status::text = 'CANCELLED')::int AS cancelled,
      COUNT(*) FILTER (WHERE t.status::text = 'NO_SHOW')::int AS no_show
    FROM travel_bookings t GROUP BY 1
  ),
  sm AS (
    SELECT s."requesterUserId" AS uid, COUNT(*)::int AS cases FROM support_cases s GROUP BY 1
  )`;

/**
 * Columns of the per-user roll-up, given `u` (users) left-joined to the CTEs above. `now` is passed in
 * rather than read from the database clock so segment boundaries are testable and match the API clock.
 */
export function customerMetricColumns(now: Date): Prisma.Sql {
  const d30 = new Date(now.getTime() - 30 * 86_400_000);
  const d90 = new Date(now.getTime() - 90 * 86_400_000);
  const purchases = Prisma.sql`(COALESCE(om.orders, 0) + COALESCE(bm.bookings, 0) + COALESCE(tm.stays, 0))`;
  const spend = Prisma.sql`(COALESCE(om.spend, 0) + COALESCE(bm.spend, 0) + COALESCE(tm.spend, 0))`;
  const lastBooking = Prisma.sql`GREATEST(bm.last_booking, tm.last_stay)`;
  const engaged = Prisma.sql`GREATEST(u."lastActiveAt", om.last_order, bm.last_booking, tm.last_stay, u."createdAt")`;
  return Prisma.sql`
    COALESCE(om.orders, 0)::int AS "orderCount",
    ${spend}::bigint AS "totalSpend",
    om.last_order AS "lastOrderAt",
    COALESCE(bm.bookings, 0)::int AS "serviceBookingCount",
    COALESCE(tm.stays, 0)::int AS "travelBookingCount",
    ${lastBooking} AS "lastBookingAt",
    (COALESCE(om.cancelled, 0) + COALESCE(bm.cancelled, 0) + COALESCE(tm.cancelled, 0))::int AS "cancelledCount",
    (COALESCE(bm.no_show, 0) + COALESCE(tm.no_show, 0))::int AS "noShowCount",
    COALESCE(sm.cases, 0)::int AS "supportCaseCount",
    ${engaged} AS "engagedAt",
    CASE
      WHEN ${engaged} >= ${d90} AND (${spend} >= ${VIP_SPEND_IRR} OR ${purchases} >= ${VIP_PURCHASES}) THEN 'VIP'
      WHEN u."createdAt" >= ${d30} THEN 'NEW'
      WHEN ${purchases} = 0 THEN 'NEVER_PURCHASED'
      WHEN ${engaged} >= ${d30} THEN 'ACTIVE'
      WHEN ${engaged} >= ${d90} THEN 'AT_RISK'
      ELSE 'DORMANT'
    END AS segment`;
}

export const CUSTOMER_METRIC_JOINS = Prisma.sql`
  LEFT JOIN om ON om.uid = u.id
  LEFT JOIN bm ON bm.uid = u.id
  LEFT JOIN tm ON tm.uid = u.id
  LEFT JOIN sm ON sm.uid = u.id`;

export interface CustomerMetricRow {
  orderCount: number;
  totalSpend: bigint | number;
  lastOrderAt: Date | null;
  serviceBookingCount: number;
  travelBookingCount: number;
  lastBookingAt: Date | null;
  cancelledCount: number;
  noShowCount: number;
  supportCaseCount: number;
  engagedAt: Date | null;
  segment: AdminCustomerSegment;
}

export const SEGMENTS: AdminCustomerSegment[] = ["NEW", "VIP", "ACTIVE", "AT_RISK", "DORMANT", "NEVER_PURCHASED"];
