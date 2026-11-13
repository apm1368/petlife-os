import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminPlaceSuggestionsService, type AdminPlaceSuggestionDto } from "@/services/admin-place-suggestions.service";
import { useAdminStore } from "@/stores/admin-store";
import { AdminPlaceSuggestionsView } from "./AdminPlaceSuggestionsView";

vi.mock("@/services/admin-place-suggestions.service", () => ({
  adminPlaceSuggestionsService: { queue: vi.fn(), approve: vi.fn(), reject: vi.fn() },
}));

const base: AdminPlaceSuggestionDto = {
  id: "s1", kind: "NEW_PLACE", status: "PENDING", name: "Dog cafe", category: "CAFE", city: "Tehran", address: "Valiasr St", latitude: null, longitude: null, notes: "Water bowls outside",
  placeId: null, proposedChanges: null, reviewNote: null, createdPlaceId: null, photoCount: 1, createdAt: "2026-11-13T09:00:00Z",
  member: { id: "u1", displayName: "Mina" }, reviewedBy: null, reviewedAt: null, place: null, currentValues: null,
  duplicates: [{ placeId: "p9", name: "Dog Cafe", city: "Tehran", category: "CAFE", status: "VERIFIED", listed: true, distanceMeters: null, sameName: true }],
  similarPendingIds: ["s2"], photos: [{ index: 0, url: "https://files.example/p.webp", expiresInSeconds: 600 }],
};
const correction: AdminPlaceSuggestionDto = {
  ...base, id: "s3", kind: "CORRECTION", name: "Laleh Park", placeId: "p1", proposedChanges: { name: "Laleh Dog Park" }, currentValues: { name: "Laleh Park" },
  place: { id: "p1", name: "Laleh Park", city: "Tehran", category: "PARK", status: "VERIFIED", listed: true }, duplicates: [], similarPendingIds: [], photos: [], latitude: 35.7, longitude: 51.4,
};

function permissions(values: string[]) {
  useAdminStore.setState({ context: { isAdmin: true, adminUserId: "a1", displayName: "Ops", role: "ADMIN", permissions: values } as never, status: "ready" });
}

describe("admin place suggestions view", () => {
  beforeEach(() => {
    vi.mocked(adminPlaceSuggestionsService.queue).mockReset();
    vi.mocked(adminPlaceSuggestionsService.approve).mockReset();
    vi.mocked(adminPlaceSuggestionsService.reject).mockReset();
    permissions(["places.view", "places.manage"]);
  });

  it("shows duplicates, photos and a correction's before/after, and needs a pin and a reason", async () => {
    vi.mocked(adminPlaceSuggestionsService.queue).mockResolvedValue({ items: [base, correction], counts: { PENDING: 2, APPROVED: 5, REJECTED: 1 } });
    vi.mocked(adminPlaceSuggestionsService.approve).mockResolvedValue({ id: "s1", status: "APPROVED", createdPlaceId: "p10" });
    vi.mocked(adminPlaceSuggestionsService.reject).mockResolvedValue({ id: "s3", status: "REJECTED" });
    renderWithIntl(<AdminPlaceSuggestionsView />);
    await screen.findByText("Dog cafe");
    expect(adminPlaceSuggestionsService.queue).toHaveBeenCalledWith({ status: "PENDING", kind: undefined });
    expect(screen.getByRole("tab", { name: "Waiting (2)" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Same name")).toBeTruthy();
    expect(screen.getByText("1 other waiting suggestion looks like this one.")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Member photo 1" }).getAttribute("src")).toBe("https://files.example/p.webp");
    expect(screen.getByText("Laleh Dog Park")).toBeTruthy();

    const approve = screen.getAllByRole("button", { name: "Approve" });
    fireEvent.click(approve[0]);
    expect((await screen.findByRole("alert")).textContent).toBe("Enter the latitude and longitude to create this place.");
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "35.71" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "51.41" } });
    fireEvent.click(approve[0]);
    await waitFor(() => expect(adminPlaceSuggestionsService.approve).toHaveBeenCalledWith("s1", { latitude: 35.71, longitude: 51.41 }));

    const reject = screen.getAllByRole("button", { name: "Reject" });
    fireEvent.click(reject[1]);
    expect(adminPlaceSuggestionsService.reject).not.toHaveBeenCalled();
    fireEvent.change(screen.getAllByLabelText("Note or reason (the member reads a rejection reason)")[1], { target: { value: "The park kept its name" } });
    fireEvent.click(reject[1]);
    await waitFor(() => expect(adminPlaceSuggestionsService.reject).toHaveBeenCalledWith("s3", "The park kept its name"));
  });

  it("filters by type and gives read-only staff no actions", async () => {
    permissions(["places.view"]);
    vi.mocked(adminPlaceSuggestionsService.queue).mockResolvedValue({ items: [base], counts: { PENDING: 1, APPROVED: 0, REJECTED: 0 } });
    renderWithIntl(<AdminPlaceSuggestionsView />);
    await screen.findByText("Dog cafe");
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "CLOSURE_REPORT" } });
    await waitFor(() => expect(adminPlaceSuggestionsService.queue).toHaveBeenLastCalledWith({ status: "PENDING", kind: "CLOSURE_REPORT" }));
  });
});
