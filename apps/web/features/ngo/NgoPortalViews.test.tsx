import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ApiError } from "@/lib/api/client";
import { ngoService } from "@/services/ngo.service";
import { NgoDonationsView, NgoOverviewView, NgoTeamView } from "./NgoPortalViews";

vi.mock("next/navigation", () => ({ usePathname: () => "/en/ngo" }));
vi.mock("@/services/ngo.service", () => ({
  ngoService: { me: vi.fn(), overview: vi.fn(), team: vi.fn(), donations: vi.fn() },
  selectedNgo: () => "org-1",
  selectNgo: vi.fn(),
}));

const membership = (role: "OWNER" | "VIEWER") => ({ current: { organizationId: "org-1", role }, memberships: [{ organizationId: "org-1", role, organization: { id: "org-1", name: "Paws Shelter", type: "SHELTER", verificationStatus: "VERIFIED" } }] });

describe("NGO portal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tells non-members plainly that they have no organization", async () => {
    const denied = new ApiError({ code: "NGO_ACCESS_DENIED", message: "x", requestId: "r" }, 403);
    vi.mocked(ngoService.me).mockRejectedValue(denied);
    vi.mocked(ngoService.overview).mockRejectedValue(denied);
    renderWithIntl(<NgoOverviewView />, "en");
    expect(await screen.findByText("You are not a member of an animal-support organization")).toBeTruthy();
  });

  it("viewers see the team but no controls to change it", async () => {
    vi.mocked(ngoService.me).mockResolvedValue(membership("VIEWER"));
    vi.mocked(ngoService.team).mockResolvedValue([{ id: "m1", displayName: "Mina", role: "OWNER", isActive: true, createdAt: "2026-01-01T00:00:00.000Z" }]);
    renderWithIntl(<NgoTeamView />, "en");
    expect(await screen.findByText(/Mina · Owner/)).toBeTruthy();
    expect(screen.queryByText("Add a member")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Role" })).toBeNull();
  });

  it("shows ledger balances and anonymous donors, with no way to edit the totals", async () => {
    vi.mocked(ngoService.me).mockResolvedValue(membership("OWNER"));
    vi.mocked(ngoService.donations).mockResolvedValue({ items: [{ id: "d1", amountIrr: 7_000_000, fundType: "RESTRICTED", campaign: { id: "c1", title: "Surgery fund" }, supportNeedListingId: null, donorName: null, createdAt: "2026-09-01T00:00:00.000Z", refundedAt: null }], total: 1, page: 1, pageSize: 20, balance: { generalAvailableIrr: 0, restrictedAvailableIrr: 7_000_000, paidIrr: 0 } });
    renderWithIntl(<NgoDonationsView />, "en");
    expect(await screen.findByText("Anonymous")).toBeTruthy();
    expect(screen.getAllByText("700,000 Toman").length).toBeGreaterThan(0);
    expect(screen.getByText(/cannot be edited/)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
