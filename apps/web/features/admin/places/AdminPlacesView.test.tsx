import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { PetFriendlyPlaceDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminPlacesService, placesService } from "@/services/places.service";
import { useAdminStore } from "@/stores/admin-store";
import { AdminPlacesView } from "./AdminPlacesView";

vi.mock("@/services/places.service", () => ({
  placesService: { adminReports: vi.fn(), adminResolveReport: vi.fn() },
  adminPlacesService: { list: vi.fn(), update: vi.fn(), setVerification: vi.fn(), setListed: vi.fn() },
}));

const place = {
  id: "place-1",
  name: "Old park",
  city: "Tehran",
  status: "VERIFIED",
  isPubliclyListed: true,
} as PetFriendlyPlaceDto;

function admin(permissions: string[]) {
  useAdminStore.setState({ status: "ready", context: { isAdmin: true, adminUserId: "admin-1", displayName: "Admin", role: "OPERATIONS", permissions } as never });
}

describe("AdminPlacesView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(placesService.adminReports).mockResolvedValue([]);
    vi.mocked(adminPlacesService.list).mockResolvedValue({ items: [place], page: 1, pageSize: 20, total: 1 });
    vi.mocked(adminPlacesService.update).mockResolvedValue({ ...place, name: "New park" });
  });

  it("does not load before admin permissions resolve", () => {
    useAdminStore.setState({ status: "loading", context: null });
    renderWithIntl(<AdminPlacesView />);
    expect(adminPlacesService.list).not.toHaveBeenCalled();
  });

  it("shows place data but no write controls to a view-only admin", async () => {
    admin(["places.view"]);
    renderWithIntl(<AdminPlacesView />);
    expect(await screen.findByText("Old park")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit name" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Unlist" })).toBeNull();
  });

  it("renames a place through the real admin update contract", async () => {
    admin(["places.view", "places.manage"]);
    vi.mocked(adminPlacesService.list)
      .mockResolvedValueOnce({ items: [place], page: 1, pageSize: 20, total: 1 })
      .mockResolvedValue({ items: [{ ...place, name: "New park" }], page: 1, pageSize: 20, total: 1 });
    renderWithIntl(<AdminPlacesView />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit name" }));
    fireEvent.change(screen.getByLabelText("Place name"), { target: { value: "New park" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(adminPlacesService.update).toHaveBeenCalledWith("place-1", { name: "New park" }));
    expect(await screen.findByText("New park")).toBeTruthy();
  });

  it("keeps the typed name visible when saving fails", async () => {
    admin(["places.view", "places.manage"]);
    vi.mocked(adminPlacesService.update).mockRejectedValue(new Error("offline"));
    renderWithIntl(<AdminPlacesView />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit name" }));
    fireEvent.change(screen.getByLabelText("Place name"), { target: { value: "Unsaved park" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect((await screen.findByRole("alert")).textContent).toContain("still here");
    expect(screen.getByDisplayValue("Unsaved park")).toBeTruthy();
  });
});
