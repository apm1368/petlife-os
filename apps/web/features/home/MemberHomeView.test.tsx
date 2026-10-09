import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { petsService } from "@/services/pets.service";
import { bookingsService } from "@/services/bookings.service";
import { usePetStore } from "@/stores/pet-store";
import { useSessionStore } from "@/stores/session-store";
import { MemberHomeView } from "./MemberHomeView";
import { routeExists } from "@/test/route-exists";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/fa/home" }));
vi.mock("@/services/pets.service", () => ({ petsService: { getOverview: vi.fn() } }));
vi.mock("@/services/bookings.service", () => ({ bookingsService: { list: vi.fn() } }));
vi.mock("@/services/commerce.service", () => ({ commerceService: { listOrders: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/services/travel-marketplace.service", () => ({ travelMarketService: { listBookings: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }) } }));
vi.mock("@/services/subscription.service", () => ({ subscriptionService: { getCurrent: vi.fn().mockRejectedValue(Object.assign(new Error("none"), { status: 404 })) } }));

const PET = { id: "pet-1", name: "پشمک", species: "DOG", breed: null, birthDate: null, approximateAgeMonths: 18, photoUrl: null, lifecycleStatus: "ACTIVE" };

function overview(extra: Record<string, unknown> = {}) {
  return { pet: PET, householdName: null, attention: [], upcoming: [], recentHealth: [], recentActivity: [], recentMemory: null, ...extra } as never;
}

describe("MemberHomeView", () => {
  beforeEach(() => {
    vi.mocked(petsService.getOverview).mockReset();
    vi.mocked(bookingsService.list).mockReset().mockResolvedValue([]);
    usePetStore.setState({ householdId: "h1", pets: [PET as never], activePetId: null });
    useSessionStore.setState({ user: { id: "u1", displayName: "مریم رضایی" } as never, status: "authenticated" });
  });

  it("shows the member's own pet — not a sample — with Persian digits, falling back to the first pet when none is active", async () => {
    vi.mocked(petsService.getOverview).mockResolvedValue(overview());
    renderWithIntl(<MemberHomeView />, "fa");
    expect(await screen.findByRole("heading", { name: "پشمک" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("سلام، مریم");
    expect(screen.getByText("سگ · ۱ سال و ۶ ماه")).toBeTruthy();
    expect(petsService.getOverview).toHaveBeenCalledWith("pet-1");
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
});
