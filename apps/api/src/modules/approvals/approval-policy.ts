import { ApprovalMode, ApprovalScope, BookingMode, PartnerSubjectType, TravelBookingMode } from "@prisma/client";

/**
 * Approval modes (owner request 2026-11-13): whether a service booking, a stay or a shop order goes through at once
 * (INSTANT) or waits for a human (NEEDS_APPROVAL). Admin sets it per vertical in the settings registry and can
 * override it per partner; the partner's own per-service / per-listing choice applies only while the vertical
 * setting is PARTNER_CHOICE. Pet-taxi dispatch is outside this policy.
 */
export const APPROVAL_SETTING_KEYS: Readonly<Record<ApprovalScope, string>> = {
  [ApprovalScope.SERVICE_BOOKINGS]: "approvals.mode.serviceBookings",
  [ApprovalScope.STAY_BOOKINGS]: "approvals.mode.stayBookings",
  [ApprovalScope.SHOP_ORDERS]: "approvals.mode.shopOrders",
};

/** The kind of partner each scope belongs to: care services and stays are run by providers, shop orders by sellers. */
export const APPROVAL_SCOPE_PARTNER: Readonly<Record<ApprovalScope, PartnerSubjectType>> = {
  [ApprovalScope.SERVICE_BOOKINGS]: PartnerSubjectType.PROVIDER,
  [ApprovalScope.STAY_BOOKINGS]: PartnerSubjectType.PROVIDER,
  [ApprovalScope.SHOP_ORDERS]: PartnerSubjectType.SELLER,
};

export const APPROVAL_SCOPES_BY_PARTNER: Readonly<Record<PartnerSubjectType, ApprovalScope[]>> = {
  [PartnerSubjectType.PROVIDER]: [ApprovalScope.SERVICE_BOOKINGS, ApprovalScope.STAY_BOOKINGS],
  [PartnerSubjectType.SELLER]: [ApprovalScope.SHOP_ORDERS],
};

/** A vertical setting value. PARTNER_CHOICE exists for bookings only; orders have no per-partner choice of their own. */
export type VerticalApprovalSetting = "PARTNER_CHOICE" | ApprovalMode;

/** Where the effective mode came from, for the admin UI and logs. */
export type ApprovalSource = "OVERRIDE" | "VERTICAL" | "PARTNER" | "DEFAULT";

export interface ResolvedApproval {
  mode: ApprovalMode;
  source: ApprovalSource;
}

/**
 * Precedence: per-partner override → vertical setting (unless PARTNER_CHOICE) → the partner's own setting → INSTANT.
 * An unknown vertical value reads as PARTNER_CHOICE, so a bad stored value can never block every order.
 */
export function resolveApprovalMode(input: { override?: ApprovalMode | null; vertical?: string | null; partnerOwnMode?: ApprovalMode | null }): ResolvedApproval {
  if (input.override) return { mode: input.override, source: "OVERRIDE" };
  if (input.vertical === ApprovalMode.INSTANT || input.vertical === ApprovalMode.NEEDS_APPROVAL) return { mode: input.vertical, source: "VERTICAL" };
  if (input.partnerOwnMode) return { mode: input.partnerOwnMode, source: "PARTNER" };
  return { mode: ApprovalMode.INSTANT, source: "DEFAULT" };
}

export const approvalFromBookingMode = (mode: BookingMode): ApprovalMode => (mode === BookingMode.REQUEST ? ApprovalMode.NEEDS_APPROVAL : ApprovalMode.INSTANT);
export const bookingModeFromApproval = (mode: ApprovalMode): BookingMode => (mode === ApprovalMode.NEEDS_APPROVAL ? BookingMode.REQUEST : BookingMode.INSTANT);
export const approvalFromStayMode = (mode: TravelBookingMode): ApprovalMode => (mode === TravelBookingMode.REQUEST_TO_BOOK ? ApprovalMode.NEEDS_APPROVAL : ApprovalMode.INSTANT);
export const stayModeFromApproval = (mode: ApprovalMode): TravelBookingMode => (mode === ApprovalMode.NEEDS_APPROVAL ? TravelBookingMode.REQUEST_TO_BOOK : TravelBookingMode.INSTANT_BOOKING);

/** Follow-up task keys: one task per booking / stay / order, so a retried create never raises a second one. */
export const approvalTaskKey = {
  serviceBooking: (bookingId: string) => `booking-approval:${bookingId}`,
  stay: (travelBookingId: string) => `stay-approval:${travelBookingId}`,
  order: (orderId: string) => `order-approval:${orderId}`,
};
