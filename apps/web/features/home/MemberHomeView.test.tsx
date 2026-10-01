import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { petsService } from "@/services/pets.service";
import { bookingsService } from "@/services/bookings.service";
import { usePetStore } from "@/stores/pet-store";
import { useSessionStore } from "@/stores/session-store";
import { MemberHomeView } from "./MemberHomeView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/fa/home" }));
vi.mock("@/services/pets.service", () => ({ petsService: { getOverview: vi.fn() } }));
vi.mock("@/services/bookings.service", () => ({ bookingsService: { list: vi.fn() } }));

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
  });
});
