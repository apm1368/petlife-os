import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminPlacesOsmService, type OsmSyncAreaDto, type PlaceClaimQueueItemDto } from "@/services/places.service";
import { useAdminStore } from "@/stores/admin-store";
import { AdminOsmAreasView, AdminPlaceClaimsView } from "./AdminPlacesOsmViews";

vi.mock("@/services/places.service", () => ({ adminPlacesOsmService: { areas: vi.fn(), saveArea: vi.fn(), run: vi.fn(), claims: vi.fn(), decide: vi.fn(), release: vi.fn() } }));

function admin(permissions: string[]) {
  useAdminStore.setState({ status: "ready", context: { isAdmin: true, adminUserId: "admin-1", displayName: "Admin", role: "OPERATIONS", permissions } as never });
}

const area: OsmSyncAreaDto = {
  id: "area-1",
  city: "Tehran",
  province: "Tehran",
  south: 35.56,
  west: 51.09,
  north: 35.84,
  east: 51.62,
  active: true,
  lastRunAt: "2026-11-13T02:00:00.000Z",
  listedPlaces: 120,
  lastRun: { id: "run-1", status: "SUCCEEDED", fetched: 130, created: 118, updated: 2, linked: 3, skipped: 7, hidden: 0, error: null, startedAt: "2026-11-13T02:00:00.000Z", finishedAt: "2026-11-13T02:01:00.000Z" },
};

const claim = (verificationStatus: string | null, status: PlaceClaimQueueItemDto["status"] = "PENDING"): PlaceClaimQueueItemDto => ({
  id: "claim-1",
  status,
  place: { id: "place-1", name: "Vet One", city: "Tehran", category: "VETERINARY" as never, source: "OSM", phone: "+98 21 000 0000", website: null, address: null, claimedByThisClaim: status === "APPROVED", osmTags: { name: "Vet One", phone: "+98 21 000 0000", "addr:street": "Valiasr" } },
  claimant: "Dr. Owner",
  organization: verificationStatus ? { id: "org-1", name: "Vet One Clinic", verificationStatus, phone: "+98 21 000 0000", website: null, address: { addressLine: "Valiasr 12", city: "Tehran", phone: null }, kycContact: { name: "Sara Rahimi", landline: "02100000000" } } : null,
  message: "This is my clinic",
  decisionReason: status === "APPROVED" ? "KYC matches" : null,
  createdAt: "2026-11-13T03:00:00.000Z",
  decidedAt: null,
});

describe("Admin OpenStreetMap areas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminPlacesOsmService.areas).mockResolvedValue([area]);
    vi.mocked(adminPlacesOsmService.run).mockResolvedValue({ started: true });
  });

  it("lists each city's last run and lets a manager start one", async () => {
    admin(["places.view", "places.manage"]);
    renderWithIntl(<AdminOsmAreasView />);
    expect(await screen.findByText("118 new, 2 updated, 0 hidden")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    await waitFor(() => expect(adminPlacesOsmService.run).toHaveBeenCalledWith("area-1"));
    expect(await screen.findByText("Started; check back in a few minutes.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "© OpenStreetMap contributors" })).toBeTruthy();
  });

  it("shows no run or edit controls to a view-only admin", async () => {
    admin(["places.view"]);
    renderWithIntl(<AdminOsmAreasView />);
    expect(await screen.findByText("Tehran", { selector: "span" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Run now" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
});

describe("Admin business claims", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cannot approve until the business passed KYC, and rejecting needs a reason", async () => {
    admin(["places.view", "places.manage"]);
    vi.mocked(adminPlacesOsmService.claims).mockResolvedValue({ items: [claim("PENDING")], total: 1, page: 1, pageSize: 20 });
    vi.mocked(adminPlacesOsmService.decide).mockResolvedValue({ id: "claim-1", status: "REJECTED" });
    renderWithIntl(<AdminPlaceClaimsView />);
    expect(await screen.findByText("KYC not finished")).toBeTruthy();
    // The business's KYC details sit next to the listing's OpenStreetMap tags.
    expect(screen.getByText(/Sara Rahimi/)).toBeTruthy();
    expect(screen.getByText("addr:street")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(adminPlacesOsmService.decide).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Reason (audit log)"), { target: { value: "Not the owner" } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(adminPlacesOsmService.decide).toHaveBeenCalledWith("claim-1", false, "Not the owner"));
  });

  it("approves a claim from a verified business", async () => {
    admin(["places.view", "places.manage"]);
    vi.mocked(adminPlacesOsmService.claims).mockResolvedValueOnce({ items: [claim("VERIFIED")], total: 1, page: 1, pageSize: 20 }).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    vi.mocked(adminPlacesOsmService.decide).mockResolvedValue({ id: "claim-1", status: "APPROVED" });
    renderWithIntl(<AdminPlaceClaimsView />);
    fireEvent.change(await screen.findByLabelText("Reason (audit log)"), { target: { value: "KYC passed, same address" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(adminPlacesOsmService.decide).toHaveBeenCalledWith("claim-1", true, "KYC passed, same address"));
    expect(await screen.findByText("No claims waiting.")).toBeTruthy();
  });

  it("releases an approved claim with a reason", async () => {
    admin(["places.view", "places.manage"]);
    vi.mocked(adminPlacesOsmService.claims).mockImplementation(async (status) => ({ items: status === "APPROVED" ? [claim("VERIFIED", "APPROVED")] : [], total: 1, page: 1, pageSize: 20 }));
    vi.mocked(adminPlacesOsmService.release).mockResolvedValue({ placeId: "place-1", released: true });
    renderWithIntl(<AdminPlaceClaimsView />);
    fireEvent.click(await screen.findByRole("tab", { name: "Approved" }));
    fireEvent.change(await screen.findByLabelText("Reason (audit log)"), { target: { value: "The real owner disputed it" } });
    fireEvent.click(screen.getByRole("button", { name: "Release from this business" }));
    await waitFor(() => expect(adminPlacesOsmService.release).toHaveBeenCalledWith("place-1", "The real owner disputed it"));
  });
});
