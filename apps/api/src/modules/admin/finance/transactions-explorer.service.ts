import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ADMIN_TRANSACTION_GATEWAYS, type AdminTransactionKind, type AdminTransactionPageDto, type AdminTransactionPurpose, type AdminTransactionRowDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ValidationApiException } from "../../../common/errors/api-exception";
import { maskPhone, normalizeIranianPhone } from "../../../common/phone/phone-normalizer";
import { maskCardOrIban, maskEmail } from "../../../common/pii/pii-mask.util";
import { csvCell } from "../../clinic-os/csv.util";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

export const TRANSACTION_KINDS = ["PAYMENT", "REFUND", "WALLET_TOP_UP", "WALLET_ADJUSTMENT"] as const satisfies readonly AdminTransactionKind[];
/** What moved the money: a payment rail when there is one, otherwise the gateway/provider; STAFF for a back-office correction. */
export const TRANSACTION_GATEWAYS = ADMIN_TRANSACTION_GATEWAYS;
export const TRANSACTION_EXPORT_MAX_ROWS = 10_000;
const PAGE_DEFAULT = 50;
/** A name search never fans out to more than this many people; a phone, email or id is an exact match. */
const PERSON_MATCH_LIMIT = 50;
const PRODUCT_MATCH_LIMIT = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TransactionsQuery {
  kind?: AdminTransactionKind;
  /** A user id, a phone number, an email address, or part of a display name. */
  person?: string;
  /** A product id, or part of a product title. */
  product?: string;
  from?: string;
  to?: string;
  minAmount?: number;
  maxAmount?: number;
  gateway?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

interface RawRow {
  kind: AdminTransactionKind;
  id: string;
  at: Date;
  amount: number;
  currency: string;
  status: string;
  gateway: string | null;
  user_id: string | null;
  ref_id: string | null;
}

interface Resolved {
  userIds: string[] | null;
  productIds: string[] | null;
}

function encodeCursor(row: { at: Date; id: string }): string {
  return Buffer.from(JSON.stringify([row.at.toISOString(), row.id])).toString("base64url");
}

function decodeCursor(cursor: string): { at: Date; id: string } {
  try {
    const [at, id] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as [string, string];
    const date = new Date(at);
    if (Number.isNaN(date.getTime()) || typeof id !== "string" || !UUID.test(id)) throw new Error("bad cursor");
    return { at: date, id };
  } catch {
    throw new ValidationApiException({ field: "cursor", reason: "INVALID_CURSOR" });
  }
}

function parseDate(value: string | undefined, field: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ValidationApiException({ field, reason: "INVALID_DATE" });
  return date;
}

/**
 * Admin → Transactions → Explorer: every money movement in one list — checkout payments (orders, bookings, stays,
 * subscriptions, donations), booking card-to-card payments, refunds, wallet top-ups and staff wallet corrections —
 * filterable by person, product, time, amount, gateway and status, newest first, with keyset pagination over
 * ("createdAt", id) so a deep page costs the same as the first.
 *
 * Read-only. Card/IBAN-like values are masked, contacts are masked, and a search that names a person is written to
 * the audit log (so is every CSV export, which also needs finance.manage at the controller).
 */
@Injectable()
export class TransactionsExplorerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditLogService,
  ) {}

  async list(admin: ResolvedAdminContext, query: TransactionsQuery, requestId?: string): Promise<AdminTransactionPageDto> {
    const limit = Math.min(Math.max(query.limit ?? PAGE_DEFAULT, 1), 100);
    const resolved = await this.resolve(query);
    const rows = await this.fetch(query, resolved, limit + 1);
    const page = rows.slice(0, limit);
    if (query.person) {
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "finance.transactions.searched",
        entityType: "TRANSACTIONS_EXPLORER",
        entityId: admin.adminUserId,
        afterSummary: { filters: this.auditFilters(query), matchedPeople: resolved.userIds?.length ?? 0, rows: page.length },
        requestId,
      });
    }
    return { items: await this.enrich(page), nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]!) : null };
  }

  /** The same filters as `list`, up to TRANSACTION_EXPORT_MAX_ROWS rows, as a CSV that spreadsheets can't execute. */
  async exportCsv(admin: ResolvedAdminContext, query: TransactionsQuery, requestId?: string): Promise<{ fileName: string; content: string; rows: number; truncated: boolean }> {
    const resolved = await this.resolve(query);
    const rows: RawRow[] = [];
    let cursor = query.cursor;
    while (rows.length < TRANSACTION_EXPORT_MAX_ROWS) {
      const batch = await this.fetch({ ...query, cursor }, resolved, Math.min(1000, TRANSACTION_EXPORT_MAX_ROWS - rows.length) + 1);
      const take = batch.slice(0, Math.min(1000, TRANSACTION_EXPORT_MAX_ROWS - rows.length));
      rows.push(...take);
      if (batch.length <= take.length || take.length === 0) break;
      cursor = encodeCursor(take[take.length - 1]!);
    }
    const truncated = rows.length >= TRANSACTION_EXPORT_MAX_ROWS && (await this.fetch({ ...query, cursor: encodeCursor(rows[rows.length - 1]!) }, resolved, 1)).length > 0;
    const items: AdminTransactionRowDto[] = [];
    for (let i = 0; i < rows.length; i += 500) items.push(...(await this.enrich(rows.slice(i, i + 500))));
    const header = ["occurredAt", "kind", "purpose", "id", "amountIrr", "currency", "direction", "status", "gateway", "personId", "personName", "personPhone", "cardMasked", "reference", "products"];
    const lines = items.map((r) => [r.occurredAt, r.kind, r.purpose, r.id, r.amountIrr, r.currency, r.direction, r.status, r.gateway ?? "", r.person?.id ?? "", r.person?.displayName ?? "", r.person?.phoneMasked ?? "", r.cardMasked ?? "", r.referenceId ?? "", r.productTitles.join("; ")]);
    await this.audit.record({
      adminUserId: admin.adminUserId,
      action: "finance.transactions.exported",
      entityType: "TRANSACTIONS_EXPLORER",
      entityId: admin.adminUserId,
      afterSummary: { filters: this.auditFilters(query), rows: items.length, truncated },
      requestId,
    });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const content = `\uFEFF${[header, ...lines].map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
    return { fileName: `transactions-${stamp}.csv`, content, rows: items.length, truncated };
  }

  /** The filters as typed (not the cursor or page size): an auditor needs to know who was searched for. */
  private auditFilters(query: TransactionsQuery) {
    const keys = ["kind", "person", "product", "from", "to", "minAmount", "maxAmount", "gateway", "status"] as const;
    return Object.fromEntries(keys.filter((k) => query[k] !== undefined && query[k] !== "").map((k) => [k, query[k]]));
  }

  private async resolve(query: TransactionsQuery): Promise<Resolved> {
    if (query.kind && !(TRANSACTION_KINDS as readonly string[]).includes(query.kind)) throw new ValidationApiException({ field: "kind", reason: "UNKNOWN_KIND", allowed: TRANSACTION_KINDS });
    if (query.gateway && !(TRANSACTION_GATEWAYS as readonly string[]).includes(query.gateway)) throw new ValidationApiException({ field: "gateway", reason: "UNKNOWN_GATEWAY", allowed: TRANSACTION_GATEWAYS });
    if (query.minAmount !== undefined && query.maxAmount !== undefined && query.minAmount > query.maxAmount) throw new ValidationApiException({ field: "maxAmount", reason: "LESS_THAN_MIN" });
    return { userIds: await this.resolvePeople(query.person), productIds: await this.resolveProducts(query.product) };
  }

  private async resolvePeople(person: string | undefined): Promise<string[] | null> {
    const q = person?.trim();
    if (!q) return null;
    if (UUID.test(q)) return [q.toLowerCase()];
    const phone = normalizeIranianPhone(q);
    if (phone) {
      const national = phone.e164.slice(3);
      const users = await this.prisma.user.findMany({ where: { phone: { in: [phone.e164, `0${national}`, national] } }, select: { id: true } });
      return users.map((u) => u.id);
    }
    if (q.includes("@")) {
      const users = await this.prisma.user.findMany({ where: { email: { equals: q, mode: "insensitive" } }, select: { id: true } });
      return users.map((u) => u.id);
    }
    if (q.length < 2) throw new ValidationApiException({ field: "person", reason: "TOO_SHORT" });
    const users = await this.prisma.user.findMany({ where: { displayName: { contains: q, mode: "insensitive" } }, select: { id: true }, take: PERSON_MATCH_LIMIT, orderBy: { createdAt: "desc" } });
    return users.map((u) => u.id);
  }

  private async resolveProducts(product: string | undefined): Promise<string[] | null> {
    const q = product?.trim();
    if (!q) return null;
    if (UUID.test(q)) return [q.toLowerCase()];
    if (q.length < 2) throw new ValidationApiException({ field: "product", reason: "TOO_SHORT" });
    const products = await this.prisma.product.findMany({ where: { OR: [{ title: { contains: q, mode: "insensitive" } }, { slug: q }] }, select: { id: true }, take: PRODUCT_MATCH_LIMIT });
    return products.map((p) => p.id);
  }

  /** One keyset page of the union, newest first. Each arm filters on its own indexed columns before the union. */
  private async fetch(query: TransactionsQuery, resolved: Resolved, take: number): Promise<RawRow[]> {
    if (resolved.userIds?.length === 0 || resolved.productIds?.length === 0) return [];
    const from = parseDate(query.from, "from");
    const to = parseDate(query.to, "to");
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const users = resolved.userIds ? Prisma.sql`ANY(${resolved.userIds}::uuid[])` : null;
    const products = resolved.productIds ? Prisma.sql`ANY(${resolved.productIds}::uuid[])` : null;

    /** The filters every arm shares, applied to that arm's own columns. */
    const common = (at: Prisma.Sql, id: Prisma.Sql, amount: Prisma.Sql, status: Prisma.Sql, gateway: Prisma.Sql, user: Prisma.Sql) => {
      const where: Prisma.Sql[] = [];
      if (from) where.push(Prisma.sql`${at} >= ${from}`);
      if (to) where.push(Prisma.sql`${at} <= ${to}`);
      if (query.minAmount !== undefined) where.push(Prisma.sql`${amount} >= ${query.minAmount}`);
      if (query.maxAmount !== undefined) where.push(Prisma.sql`${amount} <= ${query.maxAmount}`);
      if (query.status) where.push(Prisma.sql`${status}::text = ${query.status}`);
      if (query.gateway) where.push(Prisma.sql`${gateway} = ${query.gateway}`);
      if (users) where.push(Prisma.sql`${user} = ${users}`);
      if (cursor) where.push(Prisma.sql`(${at}, ${id}) < (${cursor.at}, ${cursor.id}::uuid)`);
      return where;
    };
    const whereOf = (parts: Prisma.Sql[]) => (parts.length ? Prisma.sql`WHERE ${Prisma.join(parts, " AND ")}` : Prisma.empty);
    const arms: Prisma.Sql[] = [];
    const want = (kind: AdminTransactionKind) => !query.kind || query.kind === kind;

    if (want("PAYMENT")) {
      const gateway = Prisma.sql`COALESCE(p.rail::text, p.provider::text)`;
      const where = common(Prisma.sql`p."createdAt"`, Prisma.sql`p.id`, Prisma.sql`p.amount`, Prisma.sql`p.status`, gateway, Prisma.sql`c."userId"`);
      if (products) where.push(Prisma.sql`EXISTS (SELECT 1 FROM orders o JOIN order_items oi ON oi."orderId" = o.id WHERE o."checkoutId" = p."checkoutId" AND oi."productId" = ${products})`);
      arms.push(Prisma.sql`(SELECT 'PAYMENT' AS kind, p.id, p."createdAt" AS at, p.amount, p.currency, p.status::text AS status, ${gateway} AS gateway, c."userId" AS user_id, p."checkoutId" AS ref_id
        FROM payment_intents p JOIN checkouts c ON c.id = p."checkoutId" ${whereOf(where)} ORDER BY p."createdAt" DESC, p.id DESC LIMIT ${take})`);
      // A booking paid card to card has no payment intent: its CardTransferPayment is the payment record.
      if (!products) {
        const ctWhere = common(Prisma.sql`ct."createdAt"`, Prisma.sql`ct.id`, Prisma.sql`ct."expectedAmount"`, Prisma.sql`ct.status`, Prisma.sql`'CARD_TO_CARD'`, Prisma.sql`ct."userId"`);
        ctWhere.push(Prisma.sql`ct."checkoutId" IS NULL`);
        arms.push(Prisma.sql`(SELECT 'PAYMENT' AS kind, ct.id, ct."createdAt" AS at, COALESCE(ct."receivedAmount", ct."expectedAmount") AS amount, ct.currency, ct.status::text AS status, 'CARD_TO_CARD' AS gateway, ct."userId" AS user_id, ct."bookingId" AS ref_id
          FROM card_transfer_payments ct ${whereOf(ctWhere)} ORDER BY ct."createdAt" DESC, ct.id DESC LIMIT ${take})`);
      }
    }
    if (want("REFUND")) {
      const gateway = Prisma.sql`COALESCE(rp.rail::text, rp.provider::text)`;
      const user = Prisma.sql`COALESCE(rc."userId", ro."userId")`;
      const where = common(Prisma.sql`r."createdAt"`, Prisma.sql`r.id`, Prisma.sql`r.amount`, Prisma.sql`r.status`, gateway, user);
      if (products) where.push(Prisma.sql`EXISTS (SELECT 1 FROM order_items oi WHERE oi."orderId" = r."orderId" AND oi."productId" = ${products})`);
      arms.push(Prisma.sql`(SELECT 'REFUND' AS kind, r.id, r."createdAt" AS at, r.amount, r.currency, r.status::text AS status, ${gateway} AS gateway, ${user} AS user_id, COALESCE(r."orderId", r."paymentIntentId", r."financingIntentId") AS ref_id
        FROM refunds r LEFT JOIN payment_intents rp ON rp.id = r."paymentIntentId" LEFT JOIN checkouts rc ON rc.id = rp."checkoutId" LEFT JOIN orders ro ON ro.id = r."orderId"
        ${whereOf(where)} ORDER BY r."createdAt" DESC, r.id DESC LIMIT ${take})`);
    }
    if (want("WALLET_TOP_UP") && !products) {
      const amount = Prisma.sql`COALESCE(w."receivedAmount", w.amount)`;
      const where = common(Prisma.sql`w."createdAt"`, Prisma.sql`w.id`, amount, Prisma.sql`w.status`, Prisma.sql`w.rail::text`, Prisma.sql`w."userId"`);
      arms.push(Prisma.sql`(SELECT 'WALLET_TOP_UP' AS kind, w.id, w."createdAt" AS at, ${amount} AS amount, w.currency, w.status::text AS status, w.rail::text AS gateway, w."userId" AS user_id, w."walletEntryId" AS ref_id
        FROM wallet_top_ups w ${whereOf(where)} ORDER BY w."createdAt" DESC, w.id DESC LIMIT ${take})`);
    }
    if (want("WALLET_ADJUSTMENT") && !products) {
      const where = common(Prisma.sql`a."createdAt"`, Prisma.sql`a.id`, Prisma.sql`a.amount`, Prisma.sql`a.direction`, Prisma.sql`'STAFF'`, Prisma.sql`wa."userId"`);
      arms.push(Prisma.sql`(SELECT 'WALLET_ADJUSTMENT' AS kind, a.id, a."createdAt" AS at, a.amount, wa.currency, a.direction::text AS status, 'STAFF' AS gateway, wa."userId" AS user_id, a."walletEntryId" AS ref_id
        FROM wallet_adjustments a JOIN wallet_accounts wa ON wa.id = a."walletAccountId" ${whereOf(where)} ORDER BY a."createdAt" DESC, a.id DESC LIMIT ${take})`);
    }
    if (!arms.length) return [];
    const rows = await this.prisma.$queryRaw<RawRow[]>(Prisma.sql`SELECT * FROM (${Prisma.join(arms, " UNION ALL ")}) t ORDER BY t.at DESC, t.id DESC LIMIT ${take}`);
    return rows.map((r) => ({ ...r, amount: Number(r.amount) }));
  }

  /** Who, what for, which products and which (masked) card — looked up for one page of rows at a time. */
  private async enrich(rows: RawRow[]): Promise<AdminTransactionRowDto[]> {
    if (!rows.length) return [];
    const userIds = [...new Set(rows.map((r) => r.user_id).filter((x): x is string => Boolean(x)))];
    const paymentRows = rows.filter((r) => r.kind === "PAYMENT");
    const intentIds = paymentRows.map((r) => r.id);
    const checkoutIds = [...new Set(paymentRows.map((r) => r.ref_id).filter((x): x is string => Boolean(x)))];
    const refundOrderIds = rows.filter((r) => r.kind === "REFUND" && r.ref_id).map((r) => r.ref_id!);
    const topUpIds = rows.filter((r) => r.kind === "WALLET_TOP_UP").map((r) => r.id);
    const cardIds = intentIds; // booking card transfers are listed by their own id

    const [users, bookings, stays, subscriptions, donations, orders, refundOrders, checkoutCards, bookingCards, topUps] = await Promise.all([
      userIds.length ? this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true, phone: true, email: true } }) : [],
      intentIds.length ? this.prisma.booking.findMany({ where: { paymentIntentId: { in: intentIds } }, select: { id: true, paymentIntentId: true } }) : [],
      intentIds.length ? this.prisma.travelBooking.findMany({ where: { paymentIntentId: { in: intentIds } }, select: { id: true, paymentIntentId: true } }) : [],
      intentIds.length ? this.prisma.subscriptionBillingAttempt.findMany({ where: { paymentIntentId: { in: intentIds } }, select: { id: true, paymentIntentId: true } }) : [],
      checkoutIds.length ? this.prisma.donationIntent.findMany({ where: { checkoutId: { in: checkoutIds } }, select: { id: true, checkoutId: true } }) : [],
      checkoutIds.length ? this.prisma.order.findMany({ where: { checkoutId: { in: checkoutIds } }, select: { id: true, checkoutId: true, items: { select: { productTitleSnapshot: true }, take: 5 } } }) : [],
      refundOrderIds.length ? this.prisma.order.findMany({ where: { id: { in: refundOrderIds } }, select: { id: true, items: { select: { productTitleSnapshot: true }, take: 5 } } }) : [],
      checkoutIds.length ? this.prisma.cardTransferPayment.findMany({ where: { checkoutId: { in: checkoutIds } }, select: { checkoutId: true, companyCardNumberMasked: true } }) : [],
      cardIds.length ? this.prisma.cardTransferPayment.findMany({ where: { id: { in: cardIds }, checkoutId: null }, select: { id: true, companyCardNumberMasked: true } }) : [],
      topUpIds.length ? this.prisma.walletTopUp.findMany({ where: { id: { in: topUpIds } }, select: { id: true, cardNumberMasked: true } }) : [],
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const purposeByIntent = new Map<string, AdminTransactionPurpose>();
    for (const b of bookings) if (b.paymentIntentId) purposeByIntent.set(b.paymentIntentId, "BOOKING");
    for (const s of stays) if (s.paymentIntentId) purposeByIntent.set(s.paymentIntentId, "STAY");
    for (const s of subscriptions) if (s.paymentIntentId) purposeByIntent.set(s.paymentIntentId, "SUBSCRIPTION");
    const donationCheckouts = new Set(donations.map((d) => d.checkoutId));
    const titlesByCheckout = new Map<string, string[]>();
    for (const o of orders) if (o.checkoutId) titlesByCheckout.set(o.checkoutId, [...(titlesByCheckout.get(o.checkoutId) ?? []), ...o.items.map((i) => i.productTitleSnapshot)]);
    const titlesByOrder = new Map(refundOrders.map((o) => [o.id, o.items.map((i) => i.productTitleSnapshot)]));
    const cardByCheckout = new Map(checkoutCards.map((c) => [c.checkoutId!, c.companyCardNumberMasked]));
    const cardByBookingTransfer = new Map(bookingCards.map((c) => [c.id, c.companyCardNumberMasked]));
    const cardByTopUp = new Map(topUps.map((t) => [t.id, t.cardNumberMasked]));

    return rows.map((r): AdminTransactionRowDto => {
      const u = r.user_id ? userById.get(r.user_id) : undefined;
      let purpose: AdminTransactionPurpose = "OTHER";
      let productTitles: string[] = [];
      let card: string | null | undefined = null;
      if (r.kind === "PAYMENT") {
        const bookingTransfer = cardByBookingTransfer.get(r.id);
        if (bookingTransfer !== undefined) { purpose = "BOOKING"; card = bookingTransfer; }
        else {
          purpose = purposeByIntent.get(r.id) ?? (r.ref_id && donationCheckouts.has(r.ref_id) ? "DONATION" : r.ref_id && titlesByCheckout.has(r.ref_id) ? "ORDER" : "OTHER");
          productTitles = (r.ref_id && titlesByCheckout.get(r.ref_id)) || [];
          card = r.gateway === "CARD_TO_CARD" && r.ref_id ? cardByCheckout.get(r.ref_id) : null;
        }
      } else if (r.kind === "REFUND") {
        productTitles = (r.ref_id && titlesByOrder.get(r.ref_id)) || [];
        purpose = productTitles.length ? "ORDER" : "OTHER";
      } else {
        purpose = "WALLET";
        if (r.kind === "WALLET_TOP_UP") card = cardByTopUp.get(r.id);
      }
      const direction = r.kind === "REFUND" ? "OUT" : r.kind === "WALLET_ADJUSTMENT" ? (r.status === "DEBIT" ? "OUT" : "IN") : "IN";
      return {
        kind: r.kind,
        id: r.id,
        occurredAt: r.at.toISOString(),
        amountIrr: r.amount,
        currency: r.currency,
        direction,
        status: r.status,
        gateway: r.gateway,
        purpose,
        referenceId: r.ref_id,
        person: u ? { id: u.id, displayName: u.displayName, phoneMasked: u.phone ? maskPhone(u.phone) : null, emailMasked: u.email ? maskEmail(u.email) : null } : null,
        cardMasked: card ? maskCardOrIban(card) : null,
        productTitles: productTitles.slice(0, 5),
      };
    });
  }
}
