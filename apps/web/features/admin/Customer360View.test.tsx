import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { Customer360Dto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminService } from "@/services/admin.service";
import { Customer360View } from "./Customer360View";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/admin.service", () => ({
  adminService: { getCustomer360: vi.fn(), revealPii: vi.fn(), addNote: vi.fn() },
}));

const DATA: Customer360Dto = {
  user: { id: "user-1", displayName: "Jane Doe", emailMasked: "j***@example.com", phoneMasked: "+98********12", createdAt: "2026-01-01T00:00:00.000Z" },
  households: [{ id: "h1", name: "Doe Family", city: "Tehran", memberCount: 2, pets: [{ id: "p1", name: "Milo", species: "CAT" as never, lifecycleStatus: "ACTIVE" as never }] }],
  recentOrders: [],
  recentBookings: [],
  supportCases: [],
  disputes: [],
  internalNotes: [],
  communications: [],
  activityTimeline: [],
};

describe("Customer360View", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(adminService.getCustomer360).mockReset().mockResolvedValue(DATA);
    vi.mocked(adminService.revealPii).mockReset();
    vi.mocked(adminService.addNote).mockReset();
  });

  it("shows the masked contact info and the customer's household with its pets", async () => {
    renderWithIntl(<Customer360View userId="user-1" />);

    await waitFor(() => expect(screen.getByText("Jane Doe")).toBeTruthy());
    expect(screen.getByText("j***@example.com")).toBeTruthy();
    expect(screen.getByText("Doe Family")).toBeTruthy();
    expect(screen.getByText("Milo")).toBeTruthy();
  });

  it("reveals the real email once a reason is given, without changing the underlying masked value", async () => {
    vi.mocked(adminService.revealPii).mockResolvedValue({ field: "email", value: "jane.doe@example.com" });

    renderWithIntl(<Customer360View userId="user-1" />);
    await waitFor(() => expect(screen.getByText("Jane Doe")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Verifying identity" } });
    fireEvent.click(screen.getByText("Reveal email"));

    await waitFor(() => expect(screen.getByText("jane.doe@example.com")).toBeTruthy());
    expect(adminService.revealPii).toHaveBeenCalledWith("user-1", "email", "Verifying identity");
  });

  it("adds an internal note scoped to the customer (USER entity)", async () => {
    renderWithIntl(<Customer360View userId="user-1" />);
    await waitFor(() => expect(screen.getByText("Jane Doe")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Add an internal note (never shown to the customer)"), { target: { value: "Called twice, no answer." } });
    fireEvent.click(screen.getByText("Add note"));

    await waitFor(() => expect(adminService.addNote).toHaveBeenCalledWith("USER", "user-1", "Called twice, no answer."));
  });
});
