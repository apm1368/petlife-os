import { Injectable } from "@nestjs/common";
import type { AdminOrderDetailDto, AdminOrderRowDto, AdminOrderSection, AdminOrdersPageDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { normalizeIranianPhone } from "../../../common/phone/phone-normalizer";
import { AdminAccessDeniedException, NotFoundApiException } from "../../../common/errors/api-exception";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { adminCan } from "../auth/admin-permissions";
import { toCsv } from "../../clinic-os/csv.util";
import type { Cursor, OrderFilter, OrderSectionAdapter } from "./order-adapter";
import { ShopOrdersAdapter } from "./shop-orders.adapter";
import { ServiceBookingsAdapter } from "./service-bookings.adapter";
import { TravelBookingsAdapter } from "./travel-bookings.adapter";
import { DonationsAdapter } from "./donations.adapter";
import { SubscriptionsAdapter } from "./subscriptions.adapter";

export const ORDER_SECTIONS: AdminOrderSection[] = ["SHOP", "SERVICES", "PET_TAXI", "TRAVEL", "DONATIONS", "SUBSCRIPTIONS"];
export const EXPORT_MAX_ROWS = 5000;

export interface OrdersQuery extends Omit<OrderFilter, "customerIds" | "number"> {
  section: AdminOrderSection | "ALL";
  q?: string;
  before?: string;
  limit?: number;
}

/**
 * Admin → Orders: every order-like record — shop orders, service bookings, pet-taxi rides, stays, donations, plan
 * charges — listed apart by section or merged newest first in "All". Each section decides who may see it with its
 * own permission (and vertical) exactly as its existing admin pages do; contacts are always masked here, and a phone
 * is revealed only through the audited customer reveal.
 */
@Injectable()
export class AdminOrdersService {
  private readonly adapters: Map<AdminOrderSection, OrderSectionAdapter>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditLogService,
    shop: ShopOrdersAdapter,
    services: ServiceBookingsAdapter,
    travel: TravelBookingsAdapter,
    donations: DonationsAdapter,
    subscriptions: SubscriptionsAdapter,
  ) {
    this.adapters = new Map<AdminOrderSection, OrderSectionAdapter>([shop, services, travel, donations, subscriptions].map((a) => [a.section, a]));
  }

  private visible(admin: ResolvedAdminContext): OrderSectionAdapter[] {
    return ORDER_SECTIONS.map((s) => this.adapters.get(s)).filter((a): a is OrderSectionAdapter => !!a && a.allowed(admin));
  }

  private chosen(admin: ResolvedAdminContext, section: AdminOrderSection | "ALL"): OrderSectionAdapter[] {
    const visible = this.visible(admin);
    if (section === "ALL") return visible;
    const one = visible.find((a) => a.section === section);
    if (!one) throw new AdminAccessDeniedException({ reason: "ORDER_SECTION_NOT_ALLOWED", section });
    return [one];
  }

  /**
   * `q` is either a phone number (matched to accounts) or an order reference. A phone search is itself a personal-data
   * lookup ("does this number have orders?"), so its first page is audited — that a search happened and in which
   * section, never the number.
   */
  private async filterOf(admin: ResolvedAdminContext, query: OrdersQuery, purpose: "list" | "export"): Promise<OrderFilter> {
    const { section: _s, q, before, limit: _l, ...rest } = query;
    const filter: OrderFilter = { ...rest };
    if (!q?.trim()) return filter;
    const phone = normalizeIranianPhone(q);
    if (phone) {
      const users = await this.prisma.user.findMany({ where: { phone: phone.e164 }, select: { id: true }, take: 20 });
      filter.customerIds = users.map((u) => u.id);
      if (!before) {
        await this.audit.record({ adminUserId: admin.adminUserId, action: "orders.phone_searched", entityType: "Orders", afterSummary: { section: query.section, purpose, matchedAccounts: users.length } });
      }
    } else {
      filter.number = q.trim().toUpperCase().replace(/\s/g, "");
    }
    return filter;
  }

  private static cursorOf(value: string | undefined): Cursor | null {
    if (!value) return null;
    const [at, id] = value.split("|");
    const createdAt = new Date(at ?? "");
    return Number.isNaN(createdAt.getTime()) || !id ? null : { createdAt, id };
  }

  async list(admin: ResolvedAdminContext, query: OrdersQuery): Promise<AdminOrdersPageDto> {
    const limit = Math.min(Math.max(query.limit ?? 25, 1), 50);
    const filter = await this.filterOf(admin, query, "list");
    const visible = this.visible(admin);
    const chosen = this.chosen(admin, query.section);
    const before = AdminOrdersService.cursorOf(query.before);
    // Counts per visible section with the same filters (minus the section's own status, which only makes sense in its tab).
    const countFilter: OrderFilter = query.section === "ALL" ? filter : { ...filter, status: undefined };
    const [pages, totals] = await Promise.all([
      Promise.all(chosen.map((a) => a.list(admin, filter, before, limit + 1))),
      Promise.all(visible.map(async (a) => ({ section: a.section, total: await a.count(admin, a.section === query.section ? filter : countFilter) }))),
    ]);
    const merged = pages.flat().sort((x, y) => (x.createdAt === y.createdAt ? (x.id < y.id ? 1 : -1) : x.createdAt < y.createdAt ? 1 : -1));
    const items = merged.slice(0, limit);
    const last = items.at(-1);
    return {
      section: query.section,
      sections: totals,
      items,
      nextCursor: merged.length > limit && last ? `${last.createdAt}|${last.id}` : null,
      canExport: adminCan(admin, "orders.export"),
      canRevealPii: adminCan(admin, "customer.pii.reveal"),
    };
  }

  async detail(admin: ResolvedAdminContext, section: AdminOrderSection, id: string): Promise<AdminOrderDetailDto> {
    const [adapter] = this.chosen(admin, section);
    const detail = await adapter!.detail(admin, id);
    if (!detail) throw new NotFoundApiException("Order");
    return detail;
  }

  /** CSV of the current filters (masked contacts, formula-safe cells), at most EXPORT_MAX_ROWS rows, audited. */
  async export(admin: ResolvedAdminContext, query: OrdersQuery): Promise<{ filename: string; csv: string; rows: number }> {
    if (!adminCan(admin, "orders.export")) throw new AdminAccessDeniedException({ reason: "INSUFFICIENT_PERMISSION", requiredPermissions: ["orders.export"] });
    // The route's own permission replaces the controller's view list, so the export also needs a section to see.
    const chosen = this.chosen(admin, query.section);
    if (!chosen.length) throw new AdminAccessDeniedException({ reason: "NO_ORDER_SECTION", requiredPermissions: ["commerce.view", "services.view", "travel.view", "animalSupport.view", "subscription.view"] });
    const filter = await this.filterOf(admin, query, "export");
    const rows: AdminOrderRowDto[] = [];
    let before: Cursor | null = null;
    // Page through newest first so a large section never loads in one query.
    while (rows.length < EXPORT_MAX_ROWS) {
      const pages = await Promise.all(chosen.map((a) => a.list(admin, filter, before, 500)));
      const merged = pages.flat().sort((x, y) => (x.createdAt === y.createdAt ? (x.id < y.id ? 1 : -1) : x.createdAt < y.createdAt ? 1 : -1)).slice(0, 500);
      if (!merged.length) break;
      rows.push(...merged);
      const last = merged.at(-1)!;
      before = { createdAt: new Date(last.createdAt), id: last.id };
      if (merged.length < 500) break;
    }
    const capped = rows.slice(0, EXPORT_MAX_ROWS);
    const header = ["section", "number", "created_at", "status", "stage", "partner", "items", "item_count", "customer", "customer_phone_masked", "subtotal_irr", "shipping_irr", "discount_irr", "commission_irr", "total_irr", "payment_state", "payment_method", "payment_provider", "fulfilment_status", "fulfilment_method", "tracking_code", "scheduled_at", "city"];
    const csv = toCsv(
      header,
      capped.map((r) => [
        r.section, r.number, r.createdAt, r.status, r.stage, r.partner?.name || (r.partner?.kind === "PLATFORM" ? "opetlife" : ""),
        r.items.map((i) => `${i.name}${i.variant ? ` (${i.variant})` : ""} ×${i.quantity}`), r.itemCount,
        r.customer?.anonymous ? "anonymous" : r.customer?.name ?? "", r.customer?.phoneMasked ?? "",
        r.amounts.subtotalIrr, r.amounts.shippingIrr, r.amounts.discountIrr, r.amounts.commissionIrr, r.amounts.totalIrr,
        r.payment.state, r.payment.method, r.payment.provider, r.fulfilment.status, r.fulfilment.method, r.fulfilment.trackingCode, r.fulfilment.scheduledAt, r.city,
      ]),
    );
    const { section, q: _q, before: _b, limit: _l, ...filters } = query;
    await this.audit.record({
      adminUserId: admin.adminUserId,
      action: "orders.exported",
      entityType: "Orders",
      afterSummary: { section, rows: capped.length, truncated: rows.length > EXPORT_MAX_ROWS, filters: { ...filters, from: filters.from?.toISOString(), to: filters.to?.toISOString(), search: query.q ? "yes" : "no" } },
    });
    const stamp = new Date().toISOString().slice(0, 10);
    return { filename: `opetlife-orders-${section.toLowerCase()}-${stamp}.csv`, csv: `﻿${csv}`, rows: capped.length };
  }
}
