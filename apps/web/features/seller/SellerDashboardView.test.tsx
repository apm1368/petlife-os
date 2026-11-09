import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { SellerDashboardDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { sellerOsService } from "@/services/seller-os.service";
import { useSellerStore } from "@/stores/seller-store";
import { ApiError } from "@/lib/api/client";
import { SellerDashboardView } from "./SellerDashboardView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/seller-os.service", () => ({ sellerOsService: { getDashboard: vi.fn() } }));

const DASHBOARD: SellerDashboardDto = {
  ordersRequiringActionCount: 2,
  lowStockOfferCount: 1,
  activeOfferCount: 10,
  channelSyncErrorCount: 0,
  fulfillmentExceptionCount: 0,
  ordersToday: 3,
  unitsSoldToday: 5,
  gmvTodayAmount: 1_500_000,
  recentOrders: [
    { orderId: "order-1", source: null, externalOrderId: null, status: "CONFIRMED" as never, paymentSource: "PETLIFE_PAYMENT" as never, fulfillmentStatus: null, itemCount: 2, totalAmount: 500_000, currency: "IRR", createdAt: "2026-01-01T00:00:00.000Z" },
  ],
};

describe("SellerDashboardView", () => {
  beforeEach(() => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    vi.mocked(sellerOsService.getDashboard).mockReset();
    useSellerStore.setState({
      context: { active: { sellerMembershipId: "m-1", sellerOrganizationId: "seller-1", organizationName: "Pet Bazaar", verificationStatus: "VERIFIED" as never, sellerStatus: "ACTIVE" as never, role: "OWNER" as never }, memberships: [] },
      status: "ready",
    });
  });

  it("shows dashboard tiles and recent orders", async () => {
    vi.mocked(sellerOsService.getDashboard).mockResolvedValue(DASHBOARD);

    renderWithIntl(<SellerDashboardView />);

    await waitFor(() => expect(screen.getByText("2")).toBeTruthy());
    expect(screen.getByText("10")).toBeTruthy();
    expect(screen.getByText("opetlife order")).toBeTruthy();
  });

  it("renders correctly in fa locale (RTL)", async () => {
    vi.mocked(sellerOsService.getDashboard).mockResolvedValue(DASHBOARD);

    renderWithIntl(<SellerDashboardView />, "fa");

    await waitFor(() => expect(screen.getByText("داشبورد")).toBeTruthy());
    expect(screen.getByText("سفارش‌های اخیر")).toBeTruthy();
  });

  it.each([
    ["de", "Verkäuferübersicht", "Bestellungen mit Handlungsbedarf", "Letzte Bestellungen", "Bestätigt"],
    ["es", "Panel del vendedor", "Pedidos que requieren atención", "Pedidos recientes", "Confirmado"],
  ] as const)("renders the seller dashboard body in %s without Persian UI fallback", async (locale, title, actionOrders, recentOrders, confirmed) => {
    vi.mocked(sellerOsService.getDashboard).mockResolvedValue(DASHBOARD);
    const { container } = renderWithIntl(<SellerDashboardView />, locale);

    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByText(actionOrders)).toBeTruthy();
    expect(screen.getByText(recentOrders)).toBeTruthy();
    expect(screen.getByText(confirmed)).toBeTruthy();
    expect(container.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([
    ["de", "Verkäuferdaten werden geladen …"],
    ["es", "Cargando los datos del vendedor…"],
  ] as const)("localizes the seller dashboard loading state in %s", (locale, loadingLabel) => {
    vi.mocked(sellerOsService.getDashboard).mockImplementationOnce(() => new Promise(() => undefined));
    renderWithIntl(<SellerDashboardView />, locale);
    expect(screen.getByLabelText(loadingLabel)).toBeTruthy();
  });

  it.each([
    ["de", "Das Verkäufer-Dashboard konnte nicht geladen werden."],
    ["es", "No se pudo cargar el panel del vendedor."],
  ] as const)("localizes seller dashboard failures and does not expose API English in %s", async (locale, message) => {
    vi.mocked(sellerOsService.getDashboard).mockRejectedValueOnce(new Error("internal English provider detail"));
    renderWithIntl(<SellerDashboardView />, locale);
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText("internal English provider detail")).toBeNull();
  });

  it.each([
    ["de", "Du bist offline. Prüfe deine Verbindung und versuche es erneut."],
    ["es", "No tienes conexión. Comprueba la conexión e inténtalo de nuevo."],
  ] as const)("shows an explicit seller dashboard offline state in %s", async (locale, message) => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    vi.mocked(sellerOsService.getDashboard).mockRejectedValueOnce(new Error("Failed to fetch"));
    renderWithIntl(<SellerDashboardView />, locale);
    expect(await screen.findByText(message)).toBeTruthy();
  });

  it.each([
    ["de", "Noch keine Bestellungen."],
    ["es", "Aún no hay pedidos."],
  ] as const)("translates the no-recent-orders state in %s", async (locale, message) => {
    vi.mocked(sellerOsService.getDashboard).mockResolvedValueOnce({ ...DASHBOARD, recentOrders: [] });
    renderWithIntl(<SellerDashboardView />, locale);
    expect(await screen.findByText(message)).toBeTruthy();
  });

  it.each([
    ["de", "Du hast keine Berechtigung für diesen Verkäuferbereich."],
    ["es", "No tienes permiso para ver este espacio de vendedor."],
  ] as const)("localizes seller no-access failures in %s", async (locale, message) => {
    vi.mocked(sellerOsService.getDashboard).mockRejectedValueOnce(new ApiError({ code: "SELLER_ACCESS_DENIED", message: "Forbidden in English", requestId: "r1" }, 403));
    renderWithIntl(<SellerDashboardView />, locale);
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText("Forbidden in English")).toBeNull();
  });

  it.each([
    ["de", "Es ist kein Verkäuferbereich ausgewählt."],
    ["es", "No hay ningún espacio de vendedor seleccionado."],
  ] as const)("shows a localized no-workspace empty state in %s instead of an infinite spinner", async (locale, title) => {
    useSellerStore.setState({ context: { active: null, memberships: [] } as never, status: "not-a-seller" });
    const { container } = renderWithIntl(<SellerDashboardView />, locale);
    expect(await screen.findByText(title)).toBeTruthy();
    expect(container.textContent).not.toMatch(/[\u0600-\u06FF]/);
    expect(sellerOsService.getDashboard).not.toHaveBeenCalled();
  });
});
