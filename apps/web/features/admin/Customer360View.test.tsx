import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { Customer360Dto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminService } from "@/services/admin.service";
import { Customer360View } from "./Customer360View";
import { useAdminStore } from "@/stores/admin-store";
import { ApiError } from "@/lib/api/client";

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
    useAdminStore.setState({ context: { isAdmin: true, adminUserId: "admin-1", role: "ADMIN", permissions: ["customer.view", "customer.pii.reveal"] } as never, status: "ready" });
    push.mockReset();
    vi.mocked(adminService.getCustomer360).mockReset().mockResolvedValue(DATA);
    vi.mocked(adminService.revealPii).mockReset();
    vi.mocked(adminService.addNote).mockReset();
  });

  it("does not load private records without customer.view", () => {
    useAdminStore.setState({ context: { isAdmin: true, permissions: [] } as never });
    renderWithIntl(<Customer360View userId="user-1" />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(adminService.getCustomer360).not.toHaveBeenCalled();
  });

  it("does not offer contact reveal without its separate permission", async () => {
    useAdminStore.setState({ context: { isAdmin: true, permissions: ["customer.view"] } as never });
    renderWithIntl(<Customer360View userId="user-1" />);
    await screen.findByText("Jane Doe");
    expect(screen.queryByRole("button", { name: "Reveal email" })).toBeNull();
    expect(screen.queryByLabelText("Reason")).toBeNull();
    expect(adminService.revealPii).not.toHaveBeenCalled();
  });

  it("handles a failed reveal without replacing masked contact details", async () => {
    vi.mocked(adminService.revealPii).mockRejectedValue(new Error("offline"));
    renderWithIntl(<Customer360View userId="user-1" />);
    await screen.findByText("Jane Doe");
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Identity check" } });
    fireEvent.click(screen.getByText("Reveal email"));
    await screen.findByRole("alert");
    expect(screen.getByText("j***@example.com")).toBeTruthy();
  });

  it("clears revealed data immediately when permission is revoked", async () => {
    vi.mocked(adminService.revealPii).mockResolvedValue({ field: "email", value: "private@example.com" });
    renderWithIntl(<Customer360View userId="user-1" />);
    await screen.findByText("Jane Doe");
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Identity check" } });
    fireEvent.click(screen.getByText("Reveal email"));
    await screen.findByText("private@example.com");
    act(() => useAdminStore.setState({ context: { isAdmin: true, adminUserId: "admin-1", role: "ADMIN", permissions: ["customer.view"] } as never }));
    expect(screen.queryByText("private@example.com")).toBeNull();
    await screen.findByText("j***@example.com");
  });

  it("preserves an uncertain note and only reloads GET instead of replaying the mutation", async () => {
    vi.mocked(adminService.addNote).mockRejectedValue(new Error("Lost acknowledgement"));
    renderWithIntl(<Customer360View userId="user-1" />);
    await screen.findByText("Jane Doe");
    fireEvent.change(screen.getByLabelText("Add an internal note (never shown to the customer)"), { target: { value: "Keep this draft" } });
    fireEvent.click(screen.getByText("Add note"));
    await screen.findByRole("alert");
    expect((screen.getByRole("button", { name: "Add note" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Reload recorded notes" }));
    await screen.findByText("Jane Doe");
    expect((screen.getByLabelText("Add an internal note (never shown to the customer)") as HTMLInputElement).value).toBe("Keep this draft");
    expect((screen.getByRole("button", { name: "Add note" }) as HTMLButtonElement).disabled).toBe(false);
    expect(adminService.addNote).toHaveBeenCalledTimes(1);
    expect(adminService.getCustomer360).toHaveBeenCalledTimes(2);
  });

  it("blocks duplicate note submissions while a request is pending", async () => {
    vi.mocked(adminService.addNote).mockImplementation(() => new Promise(() => {}));
    renderWithIntl(<Customer360View userId="user-1" />);
    await screen.findByText("Jane Doe");
    fireEvent.change(screen.getByLabelText("Add an internal note (never shown to the customer)"), { target: { value: "One note only" } });
    fireEvent.click(screen.getByText("Add note"));
    fireEvent.click(screen.getByText("Add note"));
    expect(adminService.addNote).toHaveBeenCalledTimes(1);
  });

  it("renders bookings already provided by the customer contract", async () => {
    vi.mocked(adminService.getCustomer360).mockResolvedValue({ ...DATA, recentBookings: [{ id: "b1", category: "VET", bookingStatus: "CONFIRMED", startAt: "2026-10-01T10:00:00Z", petId: "p1" }] });
    renderWithIntl(<Customer360View userId="user-1" />);
    await screen.findByRole("heading", { name: "Recent bookings" });
    expect(screen.queryByText("No recent bookings recorded.")).toBeNull();
  });

  it("distinguishes read failures from a missing user", async () => {
    vi.mocked(adminService.getCustomer360).mockRejectedValue(new Error("network unavailable"));
    renderWithIntl(<Customer360View userId="user-1" />);
    await screen.findByText("The customer record could not be loaded.");
    expect(screen.queryByText("Customer not found.")).toBeNull();
    vi.mocked(adminService.getCustomer360).mockRejectedValue(new ApiError({ code: "NOT_FOUND", message: "missing", requestId: "test" }, 404));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("Customer not found.");
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
