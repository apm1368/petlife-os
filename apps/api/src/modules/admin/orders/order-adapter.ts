import type { AdminOrderDetailDto, AdminOrderPaymentState, AdminOrderRowDto, AdminOrderSection, AdminOrderStage } from "@petlife/types";
import { maskPhone, normalizeIranianPhone } from "../../../common/phone/phone-normalizer";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

/** Filters every section understands; a section ignores the ones that don't apply to it (e.g. city for donations). */
export interface OrderFilter {
  /** The section's own status value (only on a single-section tab). */
  status?: string;
  stage?: AdminOrderStage;
  payment?: AdminOrderPaymentState;
  partnerId?: string;
  customerId?: string;
  /** Users matched by a phone search (already resolved); an empty list means "nobody", so no rows. */
  customerIds?: string[];
  /** Order-number search text (normalized upper-case, no spaces). */
  number?: string;
  city?: string;
  from?: Date;
  to?: Date;
}

export interface Cursor {
  createdAt: Date;
  id: string;
}

export interface OrderSectionAdapter {
  readonly section: AdminOrderSection;
  /** Whether this admin may see the section at all (permission + vertical). */
  allowed(admin: ResolvedAdminContext): boolean;
  /** Newest first, strictly before `before`. */
  list(admin: ResolvedAdminContext, filter: OrderFilter, before: Cursor | null, limit: number): Promise<AdminOrderRowDto[]>;
  count(admin: ResolvedAdminContext, filter: OrderFilter): Promise<number>;
  detail(admin: ResolvedAdminContext, id: string): Promise<AdminOrderDetailDto | null>;
}

/** Prisma `where` piece for keyset pagination on (createdAt desc, id desc). */
export function beforeCursor(before: Cursor | null) {
  if (!before) return {};
  return { OR: [{ createdAt: { lt: before.createdAt } }, { createdAt: before.createdAt, id: { lt: before.id } }] };
}

export function dateRange(filter: OrderFilter) {
  if (!filter.from && !filter.to) return {};
  return { createdAt: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } };
}

/** The first 8 hex characters of an id, upper-cased — the reference where a section has no number of its own. */
export function shortRef(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

/** Strip a known prefix ("PL-", "PL-B-", "TR-") and keep the hex part for an id-prefix search. */
export function hexPrefix(number: string | undefined): string | null {
  if (!number) return null;
  const hex = number.replace(/^(PL-B-|PL-|TR-)/, "").replace(/-/g, "");
  return /^[0-9A-F]{2,32}$/.test(hex) ? hex.toLowerCase() : null;
}

export function customer(user: { id: string; displayName: string; phone: string | null } | null | undefined): AdminOrderRowDto["customer"] {
  if (!user) return null;
  return { userId: user.id, name: user.displayName, phoneMasked: user.phone ? maskPhone(user.phone) : null, anonymous: false };
}

export const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Booking money is Decimal; everything else is integer rials. */
export const irr = (v: { toString(): string } | number | null | undefined) => (v === null || v === undefined ? null : Math.round(Number(v.toString())));

export function where<T>(...parts: Array<T | Record<string, never> | undefined | false>): { AND: T[] } {
  return { AND: parts.filter((p): p is T => !!p && Object.keys(p as object).length > 0) };
}

/** Mask a phone number however it was typed (snapshots keep "0912…" as entered). */
export function maskAnyPhone(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const e164 = normalizeIranianPhone(raw)?.e164;
  if (e164) return maskPhone(e164);
  const digits = raw.replace(/\D/g, "");
  return digits.length <= 2 ? "**" : `${"*".repeat(digits.length - 2)}${digits.slice(-2)}`;
}

export function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
