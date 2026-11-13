import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ShippingProvider, type AdminShippingOverviewDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminShippingService } from "@/services/admin-shipping.service";
import { useAdminStore } from "@/stores/admin-store";
import { AdminShippingView } from "./AdminShippingView";

vi.mock("@/services/admin-shipping.service", () => ({ adminShippingService: { methods: vi.fn(), updateMethod: vi.fn(), shipments: vi.fn(), updateShipment: vi.fn() } }));

const overview: AdminShippingOverviewDto = {
  mode: "sandbox",
  methods: [
    { provider: ShippingProvider.POST_PISHTAZ, enabled: false, active: false, note: "NEEDS_PRICE", kind: "MANUAL", config: { fixedPriceIrr: 0, includedKg: 1, perExtraKgIrr: 0, etaDaysMin: 2, etaDaysMax: 5 }, webhookSecretConfigured: null, updatedAt: null },
    { provider: ShippingProvider.ALOPEYK, enabled: true, active: true, note: "SANDBOX", kind: "API", config: {}, webhookSecretConfigured: false, updatedAt: null },
  ],
};

describe("AdminShippingView", () => {
  beforeEach(() => {
    vi.mocked(adminShippingService.methods).mockReset().mockResolvedValue(overview);
    vi.mocked(adminShippingService.shipments).mockReset().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    vi.mocked(adminShippingService.updateMethod).mockReset().mockResolvedValue(overview);
  });

  it("sets the Post Pishtaz fixed price in Toman and sends rials", async () => {
    useAdminStore.setState({ context: { permissions: ["commerce.view", "commerce.manage"] } as never });
    renderWithIntl(<AdminShippingView />, "en");
    const card = (await screen.findByRole("heading", { name: "Iran Post express (Pishtaz)" })).closest("section")!;
    expect(within(card).getByText(/Set a price first/)).toBeTruthy();
    fireEvent.click(within(card).getByLabelText("On"));
    fireEvent.change(within(card).getByLabelText("Fixed price (Toman)"), { target: { value: "75000" } });
    fireEvent.click(within(card).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(adminShippingService.updateMethod).toHaveBeenCalled());
    expect(vi.mocked(adminShippingService.updateMethod).mock.calls[0]).toEqual([ShippingProvider.POST_PISHTAZ, { enabled: true, config: { fixedPriceIrr: 750_000, includedKg: 1, perExtraKgIrr: 0, etaDaysMin: 2, etaDaysMax: 5 }, reason: undefined }]);
    // API couriers say plainly that they only estimate in sandbox and lack a webhook secret.
    expect(screen.getByText(/Test estimates until API keys are set/)).toBeTruthy();
    expect(screen.getByText("No webhook secret (needed for live mode)")).toBeTruthy();
  });

  it("prices Snappbox booked in the app with the courier rules and tells staff how to book it", async () => {
    useAdminStore.setState({ context: { permissions: ["commerce.view", "commerce.manage"] } as never });
    const courierConfig = { cities: [], baseFareIrr: 0, perKmIrr: 0, minFareIrr: 0, maxKm: 40, roadFactor: 1.3, cityFlatFareIrr: {}, defaultFlatFareIrr: 0, pickupMinutes: 45, minutesPerKm: 4 };
    vi.mocked(adminShippingService.methods).mockResolvedValue({ mode: "sandbox", methods: [{ provider: ShippingProvider.SNAPPBOX_APP, enabled: false, active: false, note: "NEEDS_PRICE", kind: "MANUAL", config: courierConfig, webhookSecretConfigured: null, updatedAt: null }] });
    renderWithIntl(<AdminShippingView />, "en");
    const card = (await screen.findByRole("heading", { name: "Snappbox — booked in the app" })).closest("section")!;
    expect(within(card).getByText(/book the courier in the regular app/)).toBeTruthy();
    fireEvent.click(within(card).getByLabelText("On"));
    fireEvent.change(within(card).getByLabelText(/Cities/), { target: { value: "تهران" } });
    fireEvent.click(within(card).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(adminShippingService.updateMethod).toHaveBeenCalled());
    const [provider, body] = vi.mocked(adminShippingService.updateMethod).mock.calls[0]!;
    expect(provider).toBe(ShippingProvider.SNAPPBOX_APP);
    expect(body).toMatchObject({ enabled: true, config: { cities: ["تهران"], maxKm: 40 } });
  });

  it("is read-only without commerce.manage", async () => {
    useAdminStore.setState({ context: { permissions: ["commerce.view"] } as never });
    renderWithIntl(<AdminShippingView />, "fa");
    expect(await screen.findByText("فقط دسترسی «مدیریت فروشگاه» می‌تواند تغییر دهد.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "ذخیره" })).toBeNull();
  });
});
