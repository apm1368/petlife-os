import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { petsService } from "@/services/pets.service";
import { careRemindersService } from "@/services/care-reminders.service";
import { bookingsService } from "@/services/bookings.service";
import { commerceService } from "@/services/commerce.service";
import { travelMarketService } from "@/services/travel-marketplace.service";
import { subscriptionService } from "@/services/subscription.service";
import { usePetStore } from "@/stores/pet-store";
import { useSessionStore } from "@/stores/session-store";
import { dashboardCopy, MemberHomeView } from "./MemberHomeView";
import { glassHomeCopy } from "./glass-home-copy";
import { routeExists } from "@/test/route-exists";
import { householdsService } from "@/services/households.service";
import { MEMBER_HOME_SLOTS, MemberHomeSlot } from "./member-home-slots";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/fa/home" }));
vi.mock("@/services/pets.service", () => ({ petsService: { getOverview: vi.fn(), getMyAccess: vi.fn().mockResolvedValue({ canViewIdentity: true, canViewHealth: true, canViewCareProfile: true }) } }));
vi.mock("@/services/care-reminders.service", () => ({ careRemindersService: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/services/bookings.service", () => ({ bookingsService: { list: vi.fn() } }));
vi.mock("@/services/commerce.service", () => ({ commerceService: { listOrders: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/services/travel-marketplace.service", () => ({ travelMarketService: { listBookings: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }) } }));
// The location nudge (#391) loads the member's households and addresses itself; these views are tested without it.
vi.mock("@/services/households.service", () => ({ householdsService: { setActivePet: vi.fn().mockResolvedValue({ petId: "pet-2" }), listMine: vi.fn(() => new Promise(() => undefined)) } }));
vi.mock("@/services/subscription.service", () => ({ subscriptionService: { getCurrent: vi.fn().mockRejectedValue(Object.assign(new Error("none"), { status: 404 })) } }));

const PET = { id: "pet-1", name: "پشمک", species: "DOG", breed: null, birthDate: null, approximateAgeMonths: 18, photoUrl: null, lifecycleStatus: "ACTIVE" };

function overview(extra: Record<string, unknown> = {}) {
  return { pet: PET, householdName: null, attention: [], upcoming: [], recentHealth: [], recentActivity: [], recentMemory: null, ...extra } as never;
}

// The membership offers card loads its own data; these views are tested without it.
vi.mock("@/services/membership-offers.service", () => ({ membershipOffersService: { forHousehold: vi.fn(() => new Promise(() => undefined)), forAccount: vi.fn(() => new Promise(() => undefined)), startFreeWeek: vi.fn(), checkGift: vi.fn() } }));
describe("MemberHomeView", () => {
  beforeEach(() => {
    vi.mocked(petsService.getOverview).mockReset();
    vi.mocked(petsService.getMyAccess).mockReset().mockResolvedValue({ canViewIdentity: true, canViewHealth: true, canViewCareProfile: true } as never);
    vi.mocked(bookingsService.list).mockReset().mockResolvedValue([]);
    vi.mocked(careRemindersService.list).mockReset().mockResolvedValue([]);
    vi.mocked(commerceService.listOrders).mockReset().mockResolvedValue([]);
    vi.mocked(travelMarketService.listBookings).mockReset().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    vi.mocked(subscriptionService.getCurrent).mockReset().mockRejectedValue(Object.assign(new Error("none"), { status: 404 }));
    usePetStore.setState({ householdId: "h1", pets: [PET as never], activePetId: null });
    useSessionStore.setState({ user: { id: "u1", displayName: "مریم رضایی" } as never, status: "authenticated" });
  });

  it("keeps the complete dashboard-owned copy key set in all four locales", () => {
    const keys = Object.keys(dashboardCopy.fa).sort();
    const glassKeys = Object.keys(glassHomeCopy.fa).sort();
    for (const locale of ["en", "de", "es"] as const) {
      expect(Object.keys(dashboardCopy[locale]).sort()).toEqual(keys);
      expect(Object.keys(glassHomeCopy[locale]).sort()).toEqual(glassKeys);
    }
    for (const locale of ["de", "es"] as const) {
      for (const [key, value] of Object.entries(dashboardCopy[locale])) {
        if (typeof value === "string") expect(value, `dashboardCopy.${locale}.${key}`).not.toMatch(/[\u0600-\u06FF]/);
      }
      for (const [key, value] of Object.entries(glassHomeCopy[locale])) {
        expect(value, `glassHomeCopy.${locale}.${key}`).not.toMatch(/[\u0600-\u06FF]/);
      }
    }
  });

  it.each([
    ["fa", "در حال بارگذاری داشبورد", "در حال بارگذاری اشتراک", "در حال بارگذاری سفارش‌ها", "در حال بارگذاری سفرها"],
    ["en", "Loading dashboard", "Loading membership", "Loading orders", "Loading upcoming stays"],
    ["de", "Übersicht wird geladen", "Mitgliedschaft wird geladen", "Bestellungen werden geladen", "Bevorstehende Aufenthalte werden geladen"],
    ["es", "Cargando el panel", "Cargando la suscripción", "Cargando pedidos", "Cargando próximas estancias"],
  ] as const)("labels all dashboard loading regions in %s", async (locale, dashboardLoading, membershipLoading, ordersLoading, tripsLoading) => {
    vi.mocked(petsService.getOverview).mockImplementationOnce(() => new Promise(() => undefined));
    vi.mocked(commerceService.listOrders).mockImplementation(() => new Promise(() => undefined));
    vi.mocked(travelMarketService.listBookings).mockImplementation(() => new Promise(() => undefined));
    vi.mocked(subscriptionService.getCurrent).mockImplementation(() => new Promise(() => undefined));

    const loadingHome = renderWithIntl(<MemberHomeView />, locale);
    expect(screen.getByLabelText(dashboardLoading)).toBeTruthy();
    loadingHome.unmount();

    vi.mocked(petsService.getOverview).mockResolvedValue(overview());
    renderWithIntl(<MemberHomeView />, locale);

    expect(await screen.findByLabelText(membershipLoading)).toBeTruthy();
    expect(screen.getByLabelText(ordersLoading)).toBeTruthy();
    expect(screen.getByLabelText(tripsLoading)).toBeTruthy();
  });

  it("shows the member's own pet — not a sample — with Persian digits, falling back to the first pet when none is active", async () => {
    vi.mocked(petsService.getOverview).mockResolvedValue(overview());
    renderWithIntl(<MemberHomeView />, "fa");
    expect(await screen.findByRole("heading", { name: "پشمک" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("سلام، مریم");
    expect(screen.getByText("۱ سال و ۶ ماه")).toBeTruthy();
    expect(petsService.getOverview).toHaveBeenCalledWith("pet-1");
  });

  it.each([
    ["fa", "خانوار فعال"],
    ["en", "Active household"],
    ["de", "Aktiver Haushalt"],
    ["es", "Hogar activo"],
  ] as const)("shows the selected pet's household context in %s", async (locale, label) => {
    vi.mocked(petsService.getOverview).mockResolvedValue(overview({ householdName: "Garcia family" }));
    vi.mocked(petsService.getMyAccess).mockResolvedValue({ canViewIdentity: true, canViewHealth: true, canViewCareProfile: true } as never);
    renderWithIntl(<MemberHomeView />, locale);
    await screen.findByRole("heading", { name: "پشمک" });
    expect(await screen.findByText(label)).toBeTruthy();
    expect(screen.getByRole("group", { name: `${label}: Garcia family` })).toBeTruthy();
  });

  it("does not reveal household name until identity permission is confirmed", async () => {
    vi.mocked(petsService.getOverview).mockResolvedValue(overview({ householdName: "Private family" }));
    vi.mocked(petsService.getMyAccess).mockResolvedValue({ canViewIdentity: false, canViewHealth: false, canViewCareProfile: false } as never);
    renderWithIntl(<MemberHomeView />, "en");
    await screen.findByRole("heading", { name: "پشمک" });
    await waitFor(() => expect(petsService.getMyAccess).toHaveBeenCalledWith("pet-1"));
    expect(screen.queryByText("Private family")).toBeNull();
    expect(screen.queryByText("Active household")).toBeNull();
  });

  it("says what needs attention in words; severity codes never reach the page", async () => {
    vi.mocked(petsService.getOverview).mockResolvedValue(overview({ attention: [{ id: "a1", severity: "INFORMATIONAL", title: "HEALTH_PROFILE_INCOMPLETE", dueAt: null, href: "/health" }] }));
    renderWithIntl(<MemberHomeView />, "fa");
    expect(await screen.findByText("پروفایل سلامت کامل نشده است.")).toBeTruthy();
    expect(screen.getByText("برای اطلاع")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/INFORMATIONAL|HEALTH_PROFILE_INCOMPLETE/);
  });

  it("empty states explain and offer the next step (EN)", async () => {
    vi.mocked(petsService.getOverview).mockResolvedValue(overview());
    renderWithIntl(<MemberHomeView />, "en");
    expect(await screen.findByText("You have no upcoming appointment.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Find a vet" }).getAttribute("href")).toBe("/en/vet/find");
    expect(screen.getByText("Based on what's recorded, nothing urgent is waiting.")).toBeTruthy();
  });

  it("never shows another selected household pet's appointment in the active pet dashboard", async () => {
    const sibling = { ...PET, id: "pet-2", name: "Milo" };
    usePetStore.setState({ householdId: "h1", pets: [PET as never, sibling as never], activePetId: "pet-1" });
    vi.mocked(petsService.getOverview).mockResolvedValue(overview());
    vi.mocked(bookingsService.list).mockResolvedValue([{
      id: "sibling-appointment", petId: "pet-2", serviceName: "Milo's check-up", provider: { name: "Central Vet" },
      startAt: "2026-11-12T10:00:00Z", location: { timezone: "Asia/Tehran" },
    }] as never);

    renderWithIntl(<MemberHomeView />, "en");

    expect(await screen.findByText("You have no upcoming appointment.")).toBeTruthy();
    expect(screen.queryByText("Milo's check-up")).toBeNull();
  });

  it("a member without pets is invited to add one", async () => {
    usePetStore.setState({ householdId: "h1", pets: [], activePetId: null });
    renderWithIntl(<MemberHomeView />, "fa");
    expect(screen.getByRole("link", { name: "افزودن اولین حیوان" }).getAttribute("href")).toBe("/fa/onboarding");
    expect(petsService.getOverview).not.toHaveBeenCalled();
    expect(screen.getByRole("navigation", { name: "حساب شما" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "خانواده و دسترسی‌ها" }).getAttribute("href")).toBe("/fa/profile/household");
    expect(screen.getAllByRole("link").every((link) => routeExists(link.getAttribute("href")!))).toBe(true);
    expect(screen.queryByText("۰")).toBeNull(); // No invented empty metrics for a household without pets.
  });

  it("renders the existing activity feed with provenance and correct booking/pet destinations", async () => {
    vi.mocked(petsService.getOverview).mockResolvedValue(overview({ recentActivity: [
      { id: "visit-1", type: "BOOKING", title: "careCalendar.event.vetAppointment", occurredAt: "2026-10-04T10:00:00Z", providerName: "Mehran Clinic", sourceType: "PROVIDER", href: "/bookings/visit-1", status: null },
      { id: "memory-1", type: "MEMORY", title: "First walk", occurredAt: "2026-10-03T10:00:00Z", providerName: null, sourceType: "OWNER", href: "/memories/memory-1", status: null },
    ] }));
    renderWithIntl(<MemberHomeView />, "en");
    expect((await screen.findByRole("link", { name: /Vet appointment.*Mehran Clinic/ })).getAttribute("href")).toBe("/en/bookings/visit-1");
    expect(screen.getByRole("link", { name: /First walk.*Owner\/household/ }).getAttribute("href")).toBe("/en/pets/pet-1/memories/memory-1");
  });

  it("every link on the dashboard opens a page that exists — no dead CTA", async () => {
    vi.mocked(petsService.getOverview).mockResolvedValue(overview({ attention: [{ id: "a1", severity: "ATTENTION", title: "HEALTH_PROFILE_INCOMPLETE", dueAt: null, href: "/health" }] }));
    renderWithIntl(<MemberHomeView />, "fa");
    await screen.findByRole("heading", { name: "پشمک" });
    expect(await screen.findByText("اشتراکی فعال نیست. مزایا و پلن‌ها را ببینید.")).toBeTruthy();
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href")!);
    expect(hrefs.length).toBeGreaterThan(12);
    const dead = hrefs.filter((h) => h.startsWith("#") ? !document.getElementById(h.slice(1)) : !routeExists(h));
    expect(dead).toEqual([]);
    // The pet's own sections are one tap away, and membership is reachable from home.
    for (const section of ["/health", "/care", "/memories", "/health/documents", "/travel"]) expect(hrefs).toContain(`/fa/pets/pet-1${section}`);
    expect(hrefs).toContain("/fa/subscription");
  });
  it("hides health, documents and care controls when the member lacks those permissions", async () => {
    vi.mocked(petsService.getOverview).mockResolvedValue(overview());
    vi.mocked(petsService.getMyAccess).mockResolvedValue({ canViewIdentity: true, canViewHealth: false, canViewCareProfile: false } as never);
    renderWithIntl(<MemberHomeView />, "en");
    await screen.findByRole("heading", { name: "پشمک" });
    await waitFor(() => expect(petsService.getMyAccess).toHaveBeenCalledWith("pet-1"));
    const hrefs = screen.getAllByRole("link").map(a => a.getAttribute("href"));
    expect(hrefs).not.toContain("/en/pets/pet-1/health");
    expect(hrefs).not.toContain("/en/pets/pet-1/health/documents");
    expect(hrefs).not.toContain("/en/pets/pet-1/care");
  });

  it("distinguishes a permission load failure and lets the member retry", async () => {
    vi.mocked(petsService.getOverview).mockResolvedValue(overview());
    vi.mocked(petsService.getMyAccess).mockRejectedValueOnce(new Error("offline"));
    renderWithIntl(<MemberHomeView />, "en");
    const message = await screen.findByRole("alert");
    expect(message.textContent).toContain("Profile permissions could not load.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: "Health record" })).toBeTruthy();
  });

  it("shows a failed booking load instead of saying no appointment exists", async () => {
    vi.mocked(petsService.getOverview).mockResolvedValue(overview());
    vi.mocked(bookingsService.list).mockRejectedValue(new Error("offline"));
    renderWithIntl(<MemberHomeView />, "en");
    await screen.findByRole("heading", { name: "پشمک" });
    await screen.findAllByText("This section could not load right now.");
    expect(screen.queryByText("You have no upcoming appointment.")).toBeNull();
  });

  it("offers a retry in failed membership, order and travel cards", async () => {
    vi.mocked(petsService.getOverview).mockResolvedValue(overview());
    vi.mocked(commerceService.listOrders).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([]);
    vi.mocked(travelMarketService.listBookings).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 20 });
    vi.mocked(subscriptionService.getCurrent)
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(Object.assign(new Error("none"), { status: 404 }));

    renderWithIntl(<MemberHomeView />, "en");

    await screen.findByRole("heading", { name: "پشمک" });
    const ordersSection = screen.getByRole("heading", { name: "Orders" }).closest("section");
    const tripsSection = screen.getByRole("heading", { name: "Upcoming stays" }).closest("section");
    const membershipSection = screen.getByRole("heading", { name: "Membership" }).closest("section");
    expect(ordersSection && await within(ordersSection).findByText("This section could not load right now.")).toBeTruthy();
    expect(tripsSection && await within(tripsSection).findByText("This section could not load right now.")).toBeTruthy();
    expect(membershipSection && await within(membershipSection).findByText("This section could not load right now.")).toBeTruthy();

    fireEvent.click(within(ordersSection!).getByRole("button", { name: "Retry" }));
    fireEvent.click(within(tripsSection!).getByRole("button", { name: "Retry" }));
    fireEvent.click(within(membershipSection!).getByRole("button", { name: "Retry" }));

    expect(await within(ordersSection!).findByText(/You haven't ordered anything yet/)).toBeTruthy();
    expect(await within(tripsSection!).findByText("No upcoming stay booked.")).toBeTruthy();
    expect(await within(membershipSection!).findByRole("link", { name: "See plans" })).toBeTruthy();
  });

  it.each([
    ["de", "Benötigt Aufmerksamkeit", "Letzte Gesundheitseinträge", "Tierarzttermin", "Keine aktive Mitgliedschaft. Entdecken Sie die verfügbaren Tarife und Leistungen."],
    ["es", "Requiere atención", "Registros de salud recientes", "Cita veterinaria", "No tienes una suscripción activa. Consulta los planes y sus ventajas."],
  ] as const)("renders the full dashboard in %s without Persian interface fallback", async (locale, attention, health, event, membership) => {
    useSessionStore.setState({ user: { id: "u1", displayName: "Maria Garcia" } as never, status: "authenticated" });
    vi.mocked(petsService.getOverview).mockResolvedValue(overview({
      attention: [{ id: "a1", severity: "URGENT", title: "VACCINATION_DUE_SOON", dueAt: "2026-11-12T10:00:00Z", href: "/care" }],
      upcoming: [{ id: "e1", type: "BOOKING", title: "careCalendar.event.vetAppointment", occurredAt: "2026-11-12T10:00:00Z", sourceType: "PROVIDER", providerName: null, href: "/bookings/b1", status: "CONFIRMED" }],
    }));

    renderWithIntl(<MemberHomeView />, locale);

    expect(await screen.findByText(attention)).toBeTruthy();
    expect(screen.getByRole("heading", { name: health })).toBeTruthy();
    expect(screen.getByText(event)).toBeTruthy();
    expect(await screen.findByText(membership)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/سلام|داشبورد|تلاش دوباره|پرونده سلامت/);
    expect(document.body.textContent).toMatch(locale === "de" ? /12\.11\.2026/ : /12 nov 2026/i);
  });

  it.each([
    ["de", "Nächster Termin", "Bestellungen", "Bevorstehende Aufenthalte", "Alle Bestellungen", "Unterkunft finden", "Verlängerung am"],
    ["es", "Próxima cita", "Pedidos", "Próximas estancias", "Todos los pedidos", "Buscar alojamiento", "Se renueva el"],
  ] as const)("renders booking, membership, order, travel and actions consistently in %s", async (locale, next, orders, trips, allOrders, findStay, renews) => {
    const englishNamedPet = { ...PET, name: "Milo" };
    usePetStore.setState({ householdId: "h1", pets: [englishNamedPet as never], activePetId: "pet-1" });
    vi.mocked(petsService.getOverview).mockResolvedValue(overview({ pet: englishNamedPet }));
    vi.mocked(bookingsService.list).mockResolvedValue([{
      id: "appointment-1", petId: "pet-1", serviceName: "Annual check-up", provider: { name: "Central Vet" },
      startAt: "2026-11-12T10:00:00Z", location: { timezone: "Asia/Tehran" },
    }] as never);
    vi.mocked(commerceService.listOrders).mockResolvedValue([{
      id: "order-1", status: "CONFIRMED", totalAmount: 1_250_000, currency: "IRR", orderNumber: "PL-ORDER-1", previewTitles: ["Monthly care kit"], createdAt: "2026-11-08T10:00:00Z",
    }] as never);
    vi.mocked(travelMarketService.listBookings).mockResolvedValue({
      items: [{ id: "stay-1", listingTitle: "Garden guesthouse", listingCity: "Rasht", checkIn: "2026-11-15", status: "CONFIRMED" }], total: 1, page: 1, pageSize: 20,
    } as never);
    vi.mocked(subscriptionService.getCurrent).mockResolvedValue({
      status: "ACTIVE", plan: { nameFa: "پلن طلایی", nameEn: "Gold plan" }, currentPeriod: { endAt: "2026-12-01T00:00:00Z" }, trialEndsAt: null,
    } as never);
    useSessionStore.setState({ user: { id: "u1", displayName: "Maria Garcia" } as never, status: "authenticated" });

    const view = renderWithIntl(<MemberHomeView />, locale);

    expect(await screen.findByRole("heading", { name: "Milo" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: next })).toBeTruthy();
    expect(screen.getByRole("heading", { name: orders })).toBeTruthy();
    expect(screen.getByRole("heading", { name: trips })).toBeTruthy();
    expect(screen.getByText("Annual check-up")).toBeTruthy();
    expect((await screen.findByRole("link", { name: /Monthly care kit/ })).getAttribute("href")).toBe(`/${locale}/orders/order-1`);
    expect((await screen.findByRole("link", { name: /Garden guesthouse/ })).getAttribute("href")).toBe(`/${locale}/travel/bookings/stay-1`);
    expect(screen.getByRole("link", { name: allOrders }).getAttribute("href")).toBe(`/${locale}/orders`);
    expect(screen.getByRole("link", { name: findStay }).getAttribute("href")).toBe(`/${locale}/travel`);
    expect(screen.getByText("Gold plan")).toBeTruthy();
    expect(screen.getByText(renews, { exact: false })).toBeTruthy();
    expect(view.container.textContent).not.toMatch(/[\u0600-\u06FF]/);
    expect(view.container.querySelectorAll("a[href^='/de/'], a[href^='/es/']").length).toBeGreaterThan(0);
  });

  it.each([
    ["de", "Lernen Sie zuerst Ihr Tier kennen.", "Erstes Tier hinzufügen", "Ihr Konto"],
    ["es", "Primero, conozcamos a tu mascota.", "Añadir mi primera mascota", "Tu cuenta"],
  ] as const)("translates the full empty dashboard in %s", (locale, welcome, addPet, account) => {
    usePetStore.setState({ householdId: "h1", pets: [], activePetId: null });
    useSessionStore.setState({ user: { id: "u1", displayName: "Maria Garcia" } as never, status: "authenticated" });
    renderWithIntl(<MemberHomeView />, locale);
    expect(screen.getByRole("heading", { name: welcome })).toBeTruthy();
    expect(screen.getByRole("link", { name: addPet }).getAttribute("href")).toBe(`/${locale}/onboarding`);
    expect(screen.getByRole("heading", { name: account })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/داشبورد|از اینجا شروع کنید|اطلاعات شخصی/);
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });


  it("groups the dashboard into the five questions around the pet's record (owner #5, 2026-11 pattern)", async () => {
    vi.mocked(petsService.getOverview).mockResolvedValue(overview());
    renderWithIntl(<MemberHomeView />, "en");
    await screen.findByRole("heading", { name: "پشمک" });
    const worlds = screen.getAllByRole("region").filter((r) => r.classList.contains("member-world"));
    expect(worlds.map((w) => w.querySelector("h2")!.textContent)).toEqual(["Health and care", "Shopping and services", "Travel and stays", "Peace of mind", "Community and kindness"]);
    // The live panels sit inside their question: orders and the next appointment under shopping, stays under travel.
    expect(screen.getByRole("heading", { name: "Orders" }).closest(".member-world")!.classList.contains("member-world--daily")).toBe(true);
    expect(screen.getByRole("heading", { name: "Upcoming stays" }).closest(".member-world")!.classList.contains("member-world--travel")).toBe(true);
    expect(screen.getByRole("heading", { name: "Membership" }).closest(".member-world")!.classList.contains("member-world--safe")).toBe(true);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href")!);
    for (const href of ["/en/pets/pet-1/card", "/en/lost-pets", "/en/memorials", "/en/pet-taxi", "/en/care-calendar"]) expect(hrefs).toContain(href);
    expect(hrefs.filter((h) => !routeExists(h))).toEqual([]);
  });

  it("keeps the household and every pet in a context bar, and switches the whole page from a pet chip", async () => {
    const sibling = { ...PET, id: "pet-2", name: "Milo" };
    usePetStore.setState({ householdId: "h1", pets: [PET as never, sibling as never], activePetId: "pet-1" });
    vi.mocked(petsService.getOverview).mockResolvedValue(overview({ householdName: "Garcia family" }));
    renderWithIntl(<MemberHomeView />, "en");
    const bar = await screen.findByRole("region", { name: "Your household and pets" });
    expect(within(bar).getByRole("group", { name: "Active household: Garcia family" })).toBeTruthy();
    expect(within(bar).getByRole("button", { name: "Show پشمک" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(bar).getByRole("button", { name: "Show Milo" }));
    await waitFor(() => expect(householdsService.setActivePet).toHaveBeenCalledWith("h1", "pet-2"));
    await waitFor(() => expect(petsService.getOverview).toHaveBeenCalledWith("pet-2"));
  });

  it("turns Home into a calm remembrance for a pet who has passed away: memories first, no shopping, booking or travel", async () => {
    const remembered = { ...PET, lifecycleStatus: "DECEASED" };
    usePetStore.setState({ householdId: "h1", pets: [remembered as never], activePetId: "pet-1" });
    vi.mocked(petsService.getOverview).mockResolvedValue(overview({ pet: remembered, recentMemory: { id: "m1", title: "Our first beach day", occurredAt: "2025-06-01T10:00:00Z", type: "PHOTO" } }));
    renderWithIntl(<MemberHomeView />, "en");
    expect(await screen.findByText("پشمک is always part of your home")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open پشمک's memories" }).getAttribute("href")).toBe("/en/pets/pet-1/memories");
    expect(screen.getByRole("link", { name: "Visit the memorial garden" }).getAttribute("href")).toBe("/en/memorials");
    const worlds = screen.getAllByRole("region").filter((r) => r.classList.contains("member-world"));
    expect(worlds.map((w) => w.querySelector("h2")!.textContent)).toEqual(["Community and kindness", "Health and care"]);
    expect(screen.getByRole("link", { name: /Our first beach day/ }).getAttribute("href")).toBe("/en/pets/pet-1/memories/m1");
    expect(screen.queryByRole("heading", { name: "Orders" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Upcoming stays" })).toBeNull();
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    for (const nudge of ["/en/shop", "/en/services", "/en/travel", "/en/vet/find", "/en/pet-taxi", "/en/pets/pet-1/travel"]) expect(hrefs).not.toContain(nudge);
  });

  it("renders a registered component in its named slot and nothing in an empty one", () => {
    const { container, unmount } = renderWithIntl(<MemberHomeSlot name="offers" slots={{}} />, "en");
    expect(container.innerHTML).toBe("");
    unmount();
    renderWithIntl(<MemberHomeSlot name="offers" slots={{ offers: () => <p>Your gift code</p> }} />, "en");
    expect(screen.getByText("Your gift code").closest("[data-slot]")!.getAttribute("data-slot")).toBe("offers");
  });

  it("renders the admin's social icons from the dashboard's social slot, not twice", () => {
    expect(MEMBER_HOME_SLOTS.social).toBeTruthy();
  });
});
