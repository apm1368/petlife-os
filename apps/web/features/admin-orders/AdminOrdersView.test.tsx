import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { AdminOrderDetailDto, AdminOrderRowDto, AdminOrdersPageDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminOrdersService } from "@/services/admin-orders.service";
import { AdminOrdersView } from "./AdminOrdersView";

const nav = vi.hoisted(() => ({ replace: vi.fn(), search: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: nav.replace, push: vi.fn() }), usePathname: () => "/en/admin/orders", useSearchParams: () => nav.search }));
vi.mock("@/services/admin-orders.service", () => ({ adminOrdersService: { list: vi.fn(), detail: vi.fn(), revealPhone: vi.fn(), exportCsv: vi.fn() } }));

const SHOP: AdminOrderRowDto = {
  section: "SHOP", id: "o1", number: "PL-1A2B3C4D", createdAt: "2026-11-10T09:00:00.000Z", status: "CONFIRMED", stage: "OPEN",
  partner: { kind: "SELLER", id: "s1", name: "Kibble House" }, items: [{ name: "Salmon kibble", variant: "2 kg", quantity: 2 }], itemCount: 3,
  customer: { userId: "u1", name: "Sara Buyer", phoneMasked: "+98*******67", anonymous: false },
  amounts: { subtotalIrr: 900_000, shippingIrr: 60_000, discountIrr: 50_000, commissionIrr: 90_000, totalIrr: 910_000 },
  payment: { state: "PAID", method: "ONLINE_PAYMENT", provider: "ZIBAL" }, fulfilment: { status: "IN_TRANSIT", method: "SNAPPBOX", trackingCode: "SB-991", scheduledAt: null }, city: "Shiraz",
};
const SUB: AdminOrderRowDto = {
  ...SHOP, section: "SUBSCRIPTIONS", id: "a1", number: "AB12CD34", status: "SUCCEEDED", stage: "COMPLETED", partner: { kind: "PLATFORM", id: null, name: "" },
  items: [{ name: "Family plan", nameFa: "طرح خانواده", variant: "MONTHLY", quantity: 1 }], itemCount: 1, payment: { state: "PAID", method: null, provider: "ZIBAL" },
  fulfilment: { status: "ACTIVE", method: "RENEWAL", trackingCode: null, scheduledAt: null }, amounts: { subtotalIrr: 500_000, shippingIrr: null, discountIrr: null, commissionIrr: null, totalIrr: 500_000 }, city: null,
};
const PAGE: AdminOrdersPageDto = { section: "ALL", sections: [{ section: "SHOP", total: 12 }, { section: "SUBSCRIPTIONS", total: 3 }], items: [SHOP, SUB], nextCursor: null, canExport: true, canRevealPii: true };
const DETAIL: AdminOrderDetailDto = {
  ...SHOP,
  lines: [{ name: "Salmon kibble", variant: "2 kg", sku: "KIB-2", quantity: 2, unitPriceIrr: 450_000, totalIrr: 900_000 }],
  timeline: [{ at: "2026-11-10T09:00:00.000Z", from: null, to: "CONFIRMED", actor: "SYSTEM", reason: null }],
  payments: [{ id: "p1", provider: "ZIBAL", rail: "ZIBAL", status: "CAPTURED", amountIrr: 910_000, createdAt: "2026-11-10T08:59:00.000Z" }],
  refunds: [], shipment: { provider: "SNAPPBOX", status: "IN_TRANSIT", trackingCode: "SB-991", estimatedDeliveryAt: null, actualDeliveryAt: null },
  address: { line: "12 Zand St", city: "Shiraz", region: "Fars", recipient: "Sara", phoneMasked: "+98*******67" },
  supportCases: [], facts: [{ key: "commissionRate", value: 10 }], legacyHref: "/admin/commerce/orders/o1",
};

describe("Admin Orders", () => {
  beforeEach(() => {
    nav.replace.mockReset();
    nav.search = new URLSearchParams();
    vi.mocked(adminOrdersService.list).mockReset().mockResolvedValue(PAGE);
    vi.mocked(adminOrdersService.detail).mockReset().mockResolvedValue(DETAIL);
    vi.mocked(adminOrdersService.revealPhone).mockReset().mockResolvedValue({ field: "phone", value: "+989121234567" });
    vi.mocked(adminOrdersService.exportCsv).mockReset().mockResolvedValue();
  });

  it("shows every section's orders with partner, items, masked customer, money, payment and delivery", async () => {
    renderWithIntl(<AdminOrdersView section="ALL" />);
    const row = (await screen.findByRole("button", { name: "Open order PL-1A2B3C4D" })).closest("tr")!;
    expect(within(row).getByText("Kibble House")).toBeTruthy();
    expect(within(row).getByText("Salmon kibble")).toBeTruthy();
    expect(within(row).getByText("+2 more items")).toBeTruthy();
    expect(within(row).getByText("+98*******67")).toBeTruthy();
    expect(within(row).getByText("Paid")).toBeTruthy();
    expect(within(row).getByText("In transit")).toBeTruthy();
    expect(within(row).getByText("SB-991")).toBeTruthy();
    expect(within(row).getAllByText("Shop").length).toBeGreaterThan(0);
    const sub = screen.getByRole("button", { name: "Open order AB12CD34" }).closest("tr")!;
    expect(within(sub).getByText("opetlife")).toBeTruthy();
    expect(within(sub).getByText("Family plan")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "15 orders" })).toBeTruthy();
    expect(adminOrdersService.list).toHaveBeenCalledWith(expect.objectContaining({ section: "ALL", limit: 25 }), expect.anything());
  });

  it("narrows to a partner or customer through the URL, and exports the same filters", async () => {
    renderWithIntl(<AdminOrdersView section="ALL" />);
    fireEvent.click(await screen.findByRole("button", { name: "Kibble House" }));
    expect(nav.replace).toHaveBeenCalledWith("/en/admin/orders?partnerId=s1&partnerName=Kibble+House", { scroll: false });
    fireEvent.click(screen.getAllByRole("button", { name: "Sara Buyer" })[0]!);
    expect(nav.replace).toHaveBeenLastCalledWith("/en/admin/orders?customerId=u1&customerName=Sara+Buyer", { scroll: false });
    fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));
    await waitFor(() => expect(adminOrdersService.exportCsv).toHaveBeenCalledWith(expect.objectContaining({ section: "ALL" })));
  });

  it("opens an order in full and reveals the phone only with a reason", async () => {
    renderWithIntl(<AdminOrdersView section="ALL" />);
    fireEvent.click(await screen.findByRole("button", { name: "Open order PL-1A2B3C4D" }));
    expect(await screen.findByText("KIB-2")).toBeTruthy();
    expect(screen.getByText(/12 Zand St/)).toBeTruthy();
    expect(screen.getByText("10%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show full mobile number" }));
    fireEvent.click(screen.getByRole("button", { name: "Show number" }));
    expect((await screen.findAllByRole("alert")).some((a) => a.textContent?.includes("at least 5 characters"))).toBe(true);
    expect(adminOrdersService.revealPhone).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Why do you need it?"), { target: { value: "Courier cannot reach" } });
    fireEvent.click(screen.getByRole("button", { name: "Show number" }));
    await waitFor(() => expect(adminOrdersService.revealPhone).toHaveBeenCalledWith("u1", "Courier cannot reach"));
    expect(await screen.findByText("+989121234567")).toBeTruthy();
  });

  it("hides export without the permission and speaks Persian, plan names included", async () => {
    vi.mocked(adminOrdersService.list).mockResolvedValue({ ...PAGE, canExport: false, canRevealPii: false });
    renderWithIntl(<AdminOrdersView section="ALL" />, "fa");
    expect(await screen.findByRole("heading", { name: "همهٔ سفارش‌ها" })).toBeTruthy();
    expect(screen.getByText("طرح خانواده")).toBeTruthy();
    expect(screen.getByText("اپت لایف")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /خروجی CSV/ })).toBeNull();
  });
});
