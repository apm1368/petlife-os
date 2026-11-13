import { ApprovalMode, ApprovalScope, BookingMode, LocationMode, ServiceCategory, TravelBookingMode } from "@prisma/client";
import { APPROVAL_SETTING_KEYS, approvalTaskKey, resolveApprovalMode } from "./approval-policy";
import { ApprovalPolicyService } from "./approval-policy.service";
import { SETTING_DEFINITIONS, settingDefinition, validateSettingValue } from "../platform-settings/setting-definitions";

describe("resolveApprovalMode — override → vertical (unless PARTNER_CHOICE) → partner's own → INSTANT", () => {
  it("a per-partner override wins over the vertical setting and the partner's own choice", () => {
    expect(resolveApprovalMode({ override: ApprovalMode.INSTANT, vertical: "NEEDS_APPROVAL", partnerOwnMode: ApprovalMode.NEEDS_APPROVAL })).toEqual({ mode: "INSTANT", source: "OVERRIDE" });
    expect(resolveApprovalMode({ override: ApprovalMode.NEEDS_APPROVAL, vertical: "INSTANT", partnerOwnMode: ApprovalMode.INSTANT })).toEqual({ mode: "NEEDS_APPROVAL", source: "OVERRIDE" });
  });

  it("a vertical INSTANT / NEEDS_APPROVAL wins over the partner's own choice", () => {
    expect(resolveApprovalMode({ override: null, vertical: "NEEDS_APPROVAL", partnerOwnMode: ApprovalMode.INSTANT })).toEqual({ mode: "NEEDS_APPROVAL", source: "VERTICAL" });
    expect(resolveApprovalMode({ override: null, vertical: "INSTANT", partnerOwnMode: ApprovalMode.NEEDS_APPROVAL })).toEqual({ mode: "INSTANT", source: "VERTICAL" });
  });

  it("PARTNER_CHOICE keeps today's per-service / per-listing choice", () => {
    expect(resolveApprovalMode({ override: null, vertical: "PARTNER_CHOICE", partnerOwnMode: ApprovalMode.NEEDS_APPROVAL })).toEqual({ mode: "NEEDS_APPROVAL", source: "PARTNER" });
    expect(resolveApprovalMode({ override: null, vertical: "PARTNER_CHOICE", partnerOwnMode: ApprovalMode.INSTANT })).toEqual({ mode: "INSTANT", source: "PARTNER" });
  });

  it("falls back to INSTANT when nothing decides (orders have no partner choice), and reads an unknown stored value as PARTNER_CHOICE", () => {
    expect(resolveApprovalMode({ override: null, vertical: "PARTNER_CHOICE" })).toEqual({ mode: "INSTANT", source: "DEFAULT" });
    expect(resolveApprovalMode({})).toEqual({ mode: "INSTANT", source: "DEFAULT" });
    expect(resolveApprovalMode({ vertical: "SOMETHING_ELSE", partnerOwnMode: ApprovalMode.NEEDS_APPROVAL })).toEqual({ mode: "NEEDS_APPROVAL", source: "PARTNER" });
  });

  it("keys one follow-up task per booking, stay and order", () => {
    expect(approvalTaskKey.serviceBooking("b1")).toBe("booking-approval:b1");
    expect(approvalTaskKey.stay("s1")).toBe("stay-approval:s1");
    expect(approvalTaskKey.order("o1")).toBe("order-approval:o1");
  });
});

describe("approval settings in the registry", () => {
  it("registers the three vertical settings with today's behaviour as the default", () => {
    const env = () => undefined;
    expect(settingDefinition(APPROVAL_SETTING_KEYS.SERVICE_BOOKINGS)).toMatchObject({ category: "approvals", type: "enum", options: ["PARTNER_CHOICE", "INSTANT", "NEEDS_APPROVAL"] });
    expect(settingDefinition(APPROVAL_SETTING_KEYS.STAY_BOOKINGS)?.fallback(env)).toBe("PARTNER_CHOICE");
    expect(settingDefinition(APPROVAL_SETTING_KEYS.SERVICE_BOOKINGS)?.fallback(env)).toBe("PARTNER_CHOICE");
    const orders = settingDefinition(APPROVAL_SETTING_KEYS.SHOP_ORDERS)!;
    expect(orders.fallback(env)).toBe("INSTANT");
    // Orders have no per-seller choice of their own, so PARTNER_CHOICE is not an option there.
    expect(validateSettingValue(orders, "PARTNER_CHOICE")).toEqual({ ok: false, reason: "OPTION_INVALID" });
    expect(validateSettingValue(orders, "NEEDS_APPROVAL")).toEqual({ ok: true, value: "NEEDS_APPROVAL" });
    expect(SETTING_DEFINITIONS.filter((d) => d.category === "approvals").every((d) => d.scope === "INTERNAL")).toBe(true);
  });
});

describe("ApprovalPolicyService", () => {
  function service(settings: Record<string, string>, overrides: Partial<Record<ApprovalScope, ApprovalMode>> = {}) {
    const findUnique = jest.fn(async (args: { where: { partnerType_organizationId_scope: { scope: ApprovalScope } } }) => {
      const mode = overrides[args.where.partnerType_organizationId_scope.scope];
      return mode ? { mode } : null;
    });
    const prisma = { partnerApprovalOverride: { findUnique } };
    const platformSettings = { get: (key: string) => settings[key] };
    return { policy: new ApprovalPolicyService(prisma as never, platformSettings as never), findUnique };
  }
  const vetService = (bookingMode: BookingMode) => ({ providerOrganizationId: "org-1", bookingMode, category: ServiceCategory.VET, locationMode: LocationMode.AT_PROVIDER });

  it("service bookings: the vertical setting turns an instant service into a request, and an INSTANT override undoes it", async () => {
    const { policy } = service({ [APPROVAL_SETTING_KEYS.SERVICE_BOOKINGS]: "NEEDS_APPROVAL" });
    expect(await policy.serviceBookingMode(vetService(BookingMode.INSTANT))).toBe(BookingMode.REQUEST);
    const trusted = service({ [APPROVAL_SETTING_KEYS.SERVICE_BOOKINGS]: "NEEDS_APPROVAL" }, { SERVICE_BOOKINGS: ApprovalMode.INSTANT });
    expect(await trusted.policy.serviceBookingMode(vetService(BookingMode.REQUEST))).toBe(BookingMode.INSTANT);
    const choice = service({ [APPROVAL_SETTING_KEYS.SERVICE_BOOKINGS]: "PARTNER_CHOICE" });
    expect(await choice.policy.serviceBookingMode(vetService(BookingMode.REQUEST))).toBe(BookingMode.REQUEST);
    expect(await choice.policy.serviceBookingMode(vetService(BookingMode.INSTANT))).toBe(BookingMode.INSTANT);
  });

  it("pet taxi keeps its own mode and never reads the policy", async () => {
    const { policy, findUnique } = service({ [APPROVAL_SETTING_KEYS.SERVICE_BOOKINGS]: "NEEDS_APPROVAL" });
    expect(await policy.serviceBookingMode({ providerOrganizationId: "org-1", bookingMode: BookingMode.INSTANT, category: ServiceCategory.PET_TAXI, locationMode: LocationMode.TRANSPORT })).toBe(BookingMode.INSTANT);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("stays map REQUEST_TO_BOOK / INSTANT_BOOKING through the same precedence", async () => {
    const { policy } = service({ [APPROVAL_SETTING_KEYS.STAY_BOOKINGS]: "INSTANT" });
    expect(await policy.stayBookingMode("org-1", TravelBookingMode.REQUEST_TO_BOOK)).toBe(TravelBookingMode.INSTANT_BOOKING);
    const strict = service({ [APPROVAL_SETTING_KEYS.STAY_BOOKINGS]: "PARTNER_CHOICE" }, { STAY_BOOKINGS: ApprovalMode.NEEDS_APPROVAL });
    expect(await strict.policy.stayBookingMode("org-1", TravelBookingMode.INSTANT_BOOKING)).toBe(TravelBookingMode.REQUEST_TO_BOOK);
  });

  it("shop orders: instant by default, held when the vertical or the seller's override says so", async () => {
    expect(await service({ [APPROVAL_SETTING_KEYS.SHOP_ORDERS]: "INSTANT" }).policy.shopOrderNeedsApproval("seller-1")).toBe(false);
    expect(await service({ [APPROVAL_SETTING_KEYS.SHOP_ORDERS]: "NEEDS_APPROVAL" }).policy.shopOrderNeedsApproval("seller-1")).toBe(true);
    expect(await service({ [APPROVAL_SETTING_KEYS.SHOP_ORDERS]: "INSTANT" }, { SHOP_ORDERS: ApprovalMode.NEEDS_APPROVAL }).policy.shopOrderNeedsApproval("seller-1")).toBe(true);
    expect(await service({ [APPROVAL_SETTING_KEYS.SHOP_ORDERS]: "NEEDS_APPROVAL" }, { SHOP_ORDERS: ApprovalMode.INSTANT }).policy.shopOrderNeedsApproval("seller-1")).toBe(false);
  });

  it("looks the override up for the right partner type", async () => {
    const { policy, findUnique } = service({});
    await policy.resolve(ApprovalScope.SHOP_ORDERS, "seller-1");
    await policy.resolve(ApprovalScope.STAY_BOOKINGS, "org-1");
    expect(findUnique.mock.calls.map((c) => (c[0] as { where: { partnerType_organizationId_scope: unknown } }).where.partnerType_organizationId_scope)).toEqual([
      { partnerType: "SELLER", organizationId: "seller-1", scope: "SHOP_ORDERS" },
      { partnerType: "PROVIDER", organizationId: "org-1", scope: "STAY_BOOKINGS" },
    ]);
  });
});
