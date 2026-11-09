import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ResolvedEntitlementDto, SubscriptionDto, SubscriptionUsageItemDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { subscriptionService } from "@/services/subscription.service";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import { SubscriptionOverviewView } from "./SubscriptionOverviewView";

const testState = vi.hoisted(() => ({ householdId: "household-1" as string | null, push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: testState.push }) }));
vi.mock("@/stores/pet-store", () => ({ usePetStore: (selector: (state: { householdId: string | null }) => unknown) => selector({ householdId: testState.householdId }) }));
vi.mock("@/services/subscription.service", () => ({
  subscriptionService: { getCurrent: vi.fn(), getEntitlements: vi.fn(), getUsage: vi.fn(), getBillingHistory: vi.fn(), cancel: vi.fn(), resume: vi.fn() },
}));

const FREE_SUB: SubscriptionDto = {
  id: "sub-1",
  status: "ACTIVE" as never,
  plan: { id: "plan-free", code: "free", nameFa: "رایگان", nameEn: "Free" },
  price: null,
  pendingPlan: null,
  pendingPrice: null,
  currentPeriod: null,
  trialEndsAt: null,
  gracePeriodEndsAt: null,
  cancelRequestedAt: null,
  cancelEffectiveAt: null,
  expiredAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const ENTITLEMENTS: ResolvedEntitlementDto[] = [{ key: "pets.max", type: "LIMIT" as never, boolValue: null, limitValue: 2, overridden: false }];
const USAGE: SubscriptionUsageItemDto[] = [{ key: "pets.max", limit: 2, used: 1, remaining: 1 }];

describe("SubscriptionOverviewView", () => {
  beforeEach(() => {
    testState.householdId = "household-1";
    testState.push.mockReset();
    vi.mocked(subscriptionService.getCurrent).mockReset();
    vi.mocked(subscriptionService.getEntitlements).mockReset().mockResolvedValue(ENTITLEMENTS);
    vi.mocked(subscriptionService.getUsage).mockReset().mockResolvedValue(USAGE);
    vi.mocked(subscriptionService.cancel).mockReset();
    vi.mocked(subscriptionService.resume).mockReset();
    vi.mocked(subscriptionService.getBillingHistory).mockReset().mockResolvedValue({ periods: [], attempts: [] });
  });

  it.each([
    ["de", "Haushalte verwalten", "Eine Mitgliedschaft gehört zu einem Haushalt. Erstellen Sie einen Haushalt oder treten Sie einem bei, bevor Sie Tarife verwalten."],
    ["es", "Gestionar hogares", "La membresía pertenece a un hogar. Crea uno o únete a uno antes de gestionar los planes."],
  ] as const)("guides a person without a household to household management in %s", async (locale, buttonLabel, message) => {
    testState.householdId = null;
    vi.mocked(subscriptionService.getCurrent).mockClear();
    renderWithIntl(<SubscriptionOverviewView />, locale);
    expect(await screen.findByText(message)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: buttonLabel }));
    expect(testState.push).toHaveBeenCalledWith(`/${locale}/profile/household`);
    expect(subscriptionService.getCurrent).not.toHaveBeenCalled();
  });

  it("shows the FREE plan, its status, and usage without ever hiding that it is free", async () => {
    vi.mocked(subscriptionService.getCurrent).mockResolvedValue(FREE_SUB);

    renderWithIntl(<SubscriptionOverviewView />);

    await waitFor(() => expect(screen.getByText("Free")).toBeTruthy());
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("1 of 2")).toBeTruthy();
    // A household on FREE has no paid period, so there is nothing to cancel.
    expect(screen.queryByText("Cancel subscription")).toBeNull();
  });

  it.each([
    ["de", "Mitgliedschaft", "Aktiv", "Enthaltene Leistungen", "1 von 2"],
    ["es", "Membresía", "Activa", "Qué incluye", "1 de 2"],
  ] as const)("renders the complete membership overview in %s without Persian UI fallback", async (locale, title, active, entitlements, usage) => {
    vi.mocked(subscriptionService.getCurrent).mockResolvedValue(FREE_SUB);
    const { container } = renderWithIntl(<SubscriptionOverviewView />, locale);

    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByText(active)).toBeTruthy();
    expect(screen.getByText(entitlements)).toBeTruthy();
    expect(screen.getByText(usage)).toBeTruthy();
    expect(screen.getByText(/plan names and descriptions|Tarifnamen und Tarifbeschreibungen|nombres y descripciones de los planes/i)).toBeTruthy();
    expect(container.textContent).not.toMatch(/[\u0600-\u06ff]/);
  });

  it.each([
    ["de", "Keine Internetverbindung. Stellen Sie die Verbindung wieder her und versuchen Sie es erneut."],
    ["es", "No hay conexión a internet. Conéctate e inténtalo de nuevo."],
  ] as const)("shows an offline recovery message in %s", async (locale, offlineMessage) => {
    const online = navigator.onLine;
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    vi.mocked(subscriptionService.getCurrent).mockRejectedValueOnce(new Error("network"));
    try {
      const { container } = renderWithIntl(<SubscriptionOverviewView />, locale);
      expect(await screen.findByText(offlineMessage)).toBeTruthy();
      expect(container.textContent).not.toContain("network");
    } finally {
      Object.defineProperty(navigator, "onLine", { configurable: true, value: online });
    }
  });

  it.each([
    ["de", "de-DE", "Der aktuelle Zeitraum endet am "],
    ["es", "es-ES", "El periodo actual termina el "],
  ] as const)("formats membership dates and currency with the %s locale", async (locale, intlLocale, prefix) => {
    const endAt = "2026-02-01T00:00:00.000Z";
    const paidSub: SubscriptionDto = {
      ...FREE_SUB,
      plan: { id: "plan-plus", code: "plus", nameFa: "پلاس", nameEn: "Plus" },
      price: { id: "price-1", countryCode: "IR", currency: "IRR", billingInterval: "MONTHLY" as never, amount: 500_000, status: "ACTIVE" as never, effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveTo: null },
      currentPeriod: { id: "period-1", status: "ACTIVE" as never, plan: { id: "plan-plus", code: "plus", nameFa: "پلاس", nameEn: "Plus" }, startAt: "2026-01-01T00:00:00.000Z", endAt, isTrial: false, amount: 500_000, currency: "IRR" },
    };
    vi.mocked(subscriptionService.getCurrent).mockResolvedValue(paidSub);
    renderWithIntl(<SubscriptionOverviewView />, locale);
    const localizedDate = new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium" }).format(new Date(endAt));
    expect(await screen.findByText(`${prefix}${localizedDate}.`)).toBeTruthy();
    expect(screen.getByText(formatCurrency(500_000, locale))).toBeTruthy();
  });

  it.each([
    ["de", "Sie haben keinen Zugriff auf die Mitgliedschaft dieses Haushalts."],
    ["es", "No tienes acceso a la membresía de este hogar."],
  ] as const)("renders a localized access-denied state on the membership page in %s", async (locale, message) => {
    vi.mocked(subscriptionService.getCurrent).mockRejectedValueOnce(new ApiError({ code: "HOUSEHOLD_ACCESS_DENIED", message: "Private English backend detail", requestId: "r1" }, 403));
    const { container } = renderWithIntl(<SubscriptionOverviewView />, locale);
    expect(await screen.findByText(message)).toBeTruthy();
    expect(container.textContent).not.toContain("Private English backend detail");
    expect(container.textContent).not.toMatch(/[\u0600-\u06ff]/);
  });

  it("shows a cancel button for a paid plan and calls the cancel endpoint", async () => {
    const paidSub: SubscriptionDto = {
      ...FREE_SUB,
      plan: { id: "plan-plus", code: "plus", nameFa: "پلاس", nameEn: "Plus" },
      price: { id: "price-1", countryCode: "IR", currency: "IRR", billingInterval: "MONTHLY" as never, amount: 500_000, status: "ACTIVE" as never, effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveTo: null },
      currentPeriod: { id: "period-1", status: "ACTIVE" as never, plan: { id: "plan-plus", code: "plus", nameFa: "پلاس", nameEn: "Plus" }, startAt: "2026-01-01T00:00:00.000Z", endAt: "2026-02-01T00:00:00.000Z", isTrial: false, amount: 500_000, currency: "IRR" },
    };
    vi.mocked(subscriptionService.getCurrent).mockResolvedValue(paidSub);
    vi.mocked(subscriptionService.cancel).mockResolvedValue({ ...paidSub, status: "CANCEL_AT_PERIOD_END" as never, cancelEffectiveAt: "2026-02-01T00:00:00.000Z" });

    renderWithIntl(<SubscriptionOverviewView />);

    await waitFor(() => expect(screen.getByText("Plus")).toBeTruthy());
    fireEvent.click(screen.getByText("Cancel subscription"));
    // Nothing happens until the consequences are confirmed.
    expect(await screen.findByText(/stays readable and exportable/)).toBeTruthy();
    expect(subscriptionService.cancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel membership" }));

    await waitFor(() => expect(subscriptionService.cancel).toHaveBeenCalledWith("household-1"));
    await waitFor(() => expect(screen.getByText("Resume subscription")).toBeTruthy());
  });

  it("surfaces the backend's own specific error message when an action fails, never a generic one", async () => {
    const paidSub: SubscriptionDto = { ...FREE_SUB, price: { id: "price-1", countryCode: "IR", currency: "IRR", billingInterval: "MONTHLY" as never, amount: 500_000, status: "ACTIVE" as never, effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveTo: null } };
    vi.mocked(subscriptionService.getCurrent).mockResolvedValue(paidSub);
    vi.mocked(subscriptionService.cancel).mockRejectedValue(new ApiError({ code: "INVALID_SUBSCRIPTION_STATUS_TRANSITION", message: "This subscription status transition is not allowed.", requestId: "req-1" }, 409));

    renderWithIntl(<SubscriptionOverviewView />);
    await waitFor(() => expect(screen.getByText("Cancel subscription")).toBeTruthy());
    fireEvent.click(screen.getByText("Cancel subscription"));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel membership" }));

    await waitFor(() => expect(screen.getByText("This subscription status transition is not allowed.")).toBeTruthy());
  });

  it("a household member (not an owner) sees what's included but no billing or membership actions", async () => {
    const paidSub: SubscriptionDto = { ...FREE_SUB, price: { id: "price-1", countryCode: "IR", currency: "IRR", billingInterval: "MONTHLY" as never, amount: 500_000, status: "ACTIVE" as never, effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveTo: null }, billingMode: "SANDBOX" };
    vi.mocked(subscriptionService.getCurrent).mockResolvedValue(paidSub);
    vi.mocked(subscriptionService.getBillingHistory).mockRejectedValue(new ApiError({ code: "HOUSEHOLD_ACCESS_DENIED", message: "no", requestId: "r" }, 403));
    renderWithIntl(<SubscriptionOverviewView />);
    await waitFor(() => expect(screen.getByText("Only a household owner can change or cancel the membership.")).toBeTruthy());
    expect(screen.queryByText("Cancel subscription")).toBeNull();
    expect(screen.queryByText("Billing history")).toBeNull();
    expect(screen.getByText(/no real money is charged/)).toBeTruthy();
    expect(screen.getByText("Your records stay yours")).toBeTruthy();
  });
});
