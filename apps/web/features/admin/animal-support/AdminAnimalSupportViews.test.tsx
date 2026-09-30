import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ApiError } from "@/lib/api/client";
import { adminAnimalSupportService } from "@/services/admin-animal-support.service";
import { AdminAnimalSupportOverviewView, AdminDonationsView, AdminLostPetDetailView, AdminReportsView } from "./AdminAnimalSupportViews";

vi.mock("next/navigation", () => ({ usePathname: () => "/en/admin/animal-support", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/admin-animal-support.service", () => ({
  adminAnimalSupportService: { overview: vi.fn(), listDonations: vi.fn(), refundDonation: vi.fn(), getLostPet: vi.fn(), revealLostPetLocation: vi.fn(), closeLostPet: vi.fn(), listReports: vi.fn(), escalateReport: vi.fn(), dismissReport: vi.fn() },
}));
const svc = vi.mocked(adminAnimalSupportService);

describe("Admin animal support console", () => {
  beforeEach(() => vi.clearAllMocks());

  it("overview shows live counts and a permission message instead of a crash", async () => {
    svc.overview.mockResolvedValueOnce({ needsAttention: { pendingListings: 3, orgsAwaitingReview: 1, openReports: 2, openTrustCases: 0 }, live: { liveListings: 5, verifiedOrgs: 2, openLostPetIncidents: 1 }, donationsLast30Days: { count: 4, amountIrr: 20_000_000, refunded: 1 } });
    const { unmount } = renderWithIntl(<AdminAnimalSupportOverviewView />, "en");
    expect(await screen.findByText("Requests awaiting review")).toBeTruthy();
    expect(screen.getByText("2,000,000 Toman")).toBeTruthy();
    unmount();
    svc.overview.mockRejectedValueOnce(new ApiError({ code: "ADMIN_PERMISSION_DENIED", message: "x", requestId: "r" }, 403));
    renderWithIntl(<AdminAnimalSupportOverviewView />, "fa");
    expect(await screen.findByText("دسترسی «animalSupport.view» لازم است")).toBeTruthy();
  });

  it("a refund needs an audited reason before it can run", async () => {
    svc.listDonations.mockResolvedValue({ items: [{ id: "d1", amountIrr: 5_000_000, fundType: "GENERAL", status: "SUCCEEDED", campaign: { id: "c1", title: "Winter food" }, organization: { id: "o1", name: "Shelter" }, donorName: "Sara", publicDisplayName: null, createdAt: "2026-09-20T00:00:00.000Z", succeededAt: "2026-09-20T00:00:00.000Z", refundedAt: null }], total: 1, page: 1, pageSize: 25 } as never);
    svc.refundDonation.mockResolvedValue({});
    renderWithIntl(<AdminDonationsView />, "en");
    fireEvent.click(await screen.findByRole("button", { name: "Refund" }));
    const confirm = screen.getByRole("button", { name: "Refund in full" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Reason (recorded in the audit log)"), { target: { value: "Duplicate donation" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(svc.refundDonation).toHaveBeenCalledWith("d1", "Duplicate donation"));
  });

  it("a lost-pet exact location stays masked until an audited reveal", async () => {
    svc.getLostPet.mockResolvedValue({ id: "i1", pet: { id: "p1", name: "Cookie", species: "DOG" }, status: "OPEN", publicArea: "Yousefabad", description: "Lost near the park", publicNotes: null, contactPreference: "IN_APP_MESSAGE", photoUrl: null, lastSeenAt: null, exactLocationRecorded: true, createdAt: "2026-09-29T00:00:00.000Z", foundAt: null });
    svc.revealLostPetLocation.mockResolvedValue({ lastKnownLocation: "Alley 7", lastKnownLatitude: 35.72, lastKnownLongitude: 51.33, privateNotes: null });
    renderWithIntl(<AdminLostPetDetailView incidentId="i1" />, "en");
    expect(await screen.findByText("Recorded (masked)")).toBeTruthy();
    expect(screen.queryByText("Alley 7")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reveal exact location" }));
    fireEvent.change(screen.getByLabelText("Reason (recorded in the audit log)"), { target: { value: "Owner asked for help" } });
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    expect(await screen.findByText("Alley 7")).toBeTruthy();
  });

  it("reports queue shows the item, not the reporter, and escalates with a reason", async () => {
    svc.listReports.mockResolvedValue({ items: [{ id: "r1", postId: null, commentId: null, supportNeedListingId: "n1", lostPetIncidentId: null, lostPetSightingId: null, organizationId: null, reason: "SCAM", details: "Asks for card-to-card", status: "OPEN", trustCaseId: null, createdAt: "2026-09-29T00:00:00.000Z" }], total: 1, page: 1, pageSize: 25 } as never);
    svc.escalateReport.mockResolvedValue({ trustCaseId: "case-1" } as never);
    renderWithIntl(<AdminReportsView />, "en");
    expect(await screen.findByRole("link", { name: "Support request" })).toBeTruthy();
    expect(screen.getByText("Scam")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Escalate" }));
    fireEvent.change(screen.getByLabelText("Reason (recorded in the audit log)"), { target: { value: "Likely fraud" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Escalate" }).at(-1)!);
    await waitFor(() => expect(svc.escalateReport).toHaveBeenCalledWith("r1", "Likely fraud"));
  });
});
