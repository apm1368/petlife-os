import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { SubscriptionDto, SubscriptionPlanDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { subscriptionService } from "@/services/subscription.service";
import { ApiError } from "@/lib/api/client";
import { SubscriptionPlansView } from "./SubscriptionPlansView";

const testState = vi.hoisted(() => ({ householdId: "household-1" as string | null, push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: testState.push }) }));
vi.mock("@/stores/pet-store", () => ({ usePetStore: (selector: (state: { householdId: string | null }) => unknown) => selector({ householdId: testState.householdId }) }));
vi.mock("@/services/subscription.service", () => ({
  subscriptionService: { getPlans: vi.fn(), getCurrent: vi.fn(), startTrial: vi.fn(), subscribe: vi.fn(), upgrade: vi.fn(), scheduleDowngrade: vi.fn() },
}));

const FREE_PLAN: SubscriptionPlanDto = {
  id: "plan-free",
  code: "free",
  nameFa: "رایگان",
  nameEn: "Free",
  descriptionFa: null,
  descriptionEn: null,
  status: "ACTIVE" as never,
  sortOrder: 0,
  isFree: true,
  trialDays: null,
  countryAvailability: ["IR"],
  entitlements: [{ key: "pets.max", type: "LIMIT" as never, boolValue: null, limitValue: 2 }],
  prices: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const PLUS_PLAN: SubscriptionPlanDto = {
  ...FREE_PLAN,
  id: "plan-plus",
  code: "plus",
  nameFa: "پلاس",
  nameEn: "Plus",
  isFree: false,
  sortOrder: 1,
  trialDays: 14,
  entitlements: [{ key: "pets.max", type: "LIMIT" as never, boolValue: null, limitValue: 5 }],
  prices: [{ id: "price-1", countryCode: "IR", currency: "IRR", billingInterval: "MONTHLY" as never, amount: 500_000, status: "ACTIVE" as never, effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveTo: null }],
};

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

// The membership offers card loads its own data; these views are tested without it.
vi.mock("@/services/membership-offers.service", () => ({ membershipOffersService: { forHousehold: vi.fn(() => new Promise(() => undefined)), forAccount: vi.fn(() => new Promise(() => undefined)), startFreeWeek: vi.fn(), checkGift: vi.fn() } }));
describe("SubscriptionPlansView", () => {
  beforeEach(() => {
    testState.householdId = "household-1";
    testState.push.mockReset();
    vi.mocked(subscriptionService.getPlans).mockReset().mockResolvedValue([FREE_PLAN, PLUS_PLAN]);
    vi.mocked(subscriptionService.getCurrent).mockReset().mockResolvedValue(FREE_SUB);
    vi.mocked(subscriptionService.startTrial).mockReset();
    vi.mocked(subscriptionService.subscribe).mockReset();
    vi.mocked(subscriptionService.upgrade).mockReset();
    vi.mocked(subscriptionService.scheduleDowngrade).mockReset();
  });

  it.each([
    ["de", "Haushalte verwalten", "Eine Mitgliedschaft gehört zu einem Haushalt. Erstellen Sie einen Haushalt oder treten Sie einem bei, bevor Sie Tarife verwalten."],
    ["es", "Gestionar hogares", "La membresía pertenece a un hogar. Crea uno o únete a uno antes de gestionar los planes."],
  ] as const)("guides a person without a household to household management in %s", async (locale, buttonLabel, message) => {
    testState.householdId = null;
    renderWithIntl(<SubscriptionPlansView />, locale);
    expect(await screen.findByText(message)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: buttonLabel }));
    expect(testState.push).toHaveBeenCalledWith(`/${locale}/profile/household`);
    expect(subscriptionService.getPlans).not.toHaveBeenCalled();
  });

  it("shows the FREE plan alongside paid plans — never hidden", async () => {
    renderWithIntl(<SubscriptionPlansView />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Free" })).toBeTruthy());
    expect(screen.getByText("Plus")).toBeTruthy();
    expect(screen.getByText("Current plan")).toBeTruthy();
  });

  it.each([
    ["de", "Tarife", "Mitgliedschaftsdauer", "Monatlich", "Tarifnamen und Tarifbeschreibungen"],
    ["es", "Planes", "Duración de la membresía", "Mensual", "nombres y descripciones de los planes"],
  ] as const)("renders the plan comparison in %s with localized controls and source-language disclosure", async (locale, title, duration, monthly, contentNotice) => {
    const { container } = renderWithIntl(<SubscriptionPlansView />, locale);

    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByLabelText(duration)).toBeTruthy();
    expect(screen.getByRole("button", { name: monthly })).toBeTruthy();
    expect(screen.getAllByText(new RegExp(contentNotice, "i")).length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/[\u0600-\u06ff]/);
  });

  it.each([
    ["de", "Keine Internetverbindung. Stellen Sie die Verbindung wieder her und versuchen Sie es erneut."],
    ["es", "No hay conexión a internet. Conéctate e inténtalo de nuevo."],
  ] as const)("shows an offline recovery message on the plans page in %s", async (locale, offlineMessage) => {
    const online = navigator.onLine;
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    vi.mocked(subscriptionService.getPlans).mockRejectedValueOnce(new Error("network"));
    try {
      const { container } = renderWithIntl(<SubscriptionPlansView />, locale);
      expect(await screen.findByText(offlineMessage)).toBeTruthy();
      expect(container.textContent).not.toContain("network");
    } finally {
      Object.defineProperty(navigator, "onLine", { configurable: true, value: online });
    }
  });

  it.each([["de", "Zurzeit sind keine Tarife verfügbar.", "Mitgliedschaftsdauer"], ["es", "No hay planes disponibles en este momento.", "Duración de la membresía"]] as const)("shows a real empty catalog state in %s", async (locale, emptyMessage, durationLabel) => {
    vi.mocked(subscriptionService.getPlans).mockResolvedValueOnce([]);
    const { container } = renderWithIntl(<SubscriptionPlansView />, locale);
    expect(await screen.findByText(emptyMessage)).toBeTruthy();
    expect(screen.queryByLabelText(durationLabel)).toBeNull();
    expect(container.textContent).not.toMatch(/[\u0600-\u06ff]/);
  });

  it.each([
    ["de", "Sie haben keinen Zugriff auf die Mitgliedschaft dieses Haushalts."],
    ["es", "No tienes acceso a la membresía de este hogar."],
  ] as const)("renders a localized access-denied state on the plans page in %s", async (locale, message) => {
    vi.mocked(subscriptionService.getCurrent).mockRejectedValueOnce(new ApiError({ code: "HOUSEHOLD_ACCESS_DENIED", message: "Private English backend detail", requestId: "r1" }, 403));
    const { container } = renderWithIntl(<SubscriptionPlansView />, locale);
    expect(await screen.findByText(message)).toBeTruthy();
    expect(container.textContent).not.toContain("Private English backend detail");
    expect(container.textContent).not.toMatch(/[\u0600-\u06ff]/);
  });

  it("offers a trial and a subscribe action for a paid plan when the household is on FREE", async () => {
    renderWithIntl(<SubscriptionPlansView />);
    await waitFor(() => expect(screen.getByText("Plus")).toBeTruthy());

    expect(screen.getByText("Start 14-day trial")).toBeTruthy();
    fireEvent.click(screen.getByText("Subscribe"));

    await waitFor(() => expect(subscriptionService.subscribe).toHaveBeenCalledWith("household-1", { planId: "plan-plus", billingInterval: "MONTHLY" }));
  });

  it("offers upgrade-now and switch-at-renewal for a different paid plan once already on a paid plan", async () => {
    const premiumPlan: SubscriptionPlanDto = { ...PLUS_PLAN, id: "plan-premium", code: "premium", nameEn: "Premium", nameFa: "پرمیوم", sortOrder: 2 };
    vi.mocked(subscriptionService.getPlans).mockResolvedValue([FREE_PLAN, PLUS_PLAN, premiumPlan]);
    vi.mocked(subscriptionService.getCurrent).mockResolvedValue({ ...FREE_SUB, plan: { id: "plan-plus", code: "plus", nameFa: "پلاس", nameEn: "Plus" }, price: PLUS_PLAN.prices[0]! });

    renderWithIntl(<SubscriptionPlansView />);
    await waitFor(() => expect(screen.getByText("Premium")).toBeTruthy());

    fireEvent.click(screen.getByText("Upgrade now"));
    await waitFor(() => expect(subscriptionService.upgrade).toHaveBeenCalledWith("household-1", { planId: "plan-premium", billingInterval: "MONTHLY" }));

    // The current paid plan itself offers a downgrade path to Free.
    fireEvent.click(screen.getByText("Downgrade to Free"));
    await waitFor(() => expect(subscriptionService.scheduleDowngrade).toHaveBeenCalledWith("household-1", "plan-free"));
  });
});
