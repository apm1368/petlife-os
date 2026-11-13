import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ApiError } from "@/lib/api/client";
import { adminPrivacyService, type AdminDeletionRequest } from "@/services/admin-privacy.service";
import { AdminDeletionRequestsView } from "./AdminDeletionRequestsView";

const search = vi.hoisted(() => ({ value: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => search.value, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/en/admin/privacy/deletion-requests" }));
vi.mock("@/services/admin-privacy.service", () => ({ adminPrivacyService: { deletionRequests: vi.fn(), transition: vi.fn() } }));

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const ROWS: AdminDeletionRequest[] = [
  { id: "r1", userId: "u1", displayName: "Sara", state: "REQUESTED", status: "PENDING", requestedAt: day(9), stateChangedAt: day(9), stateNote: null, impactSnapshot: { households: [{ id: "h1", name: "Home", role: "OWNER", otherMembers: 2, pets: 3, membershipStatus: null, onlyOwnerWithOthers: true }] } },
  { id: "r2", userId: "u2", displayName: "Omid", state: "PENDING_RETENTION", status: "PENDING", requestedAt: day(20), stateChangedAt: day(3), stateNote: "Invoices kept for tax law", impactSnapshot: null },
];

describe("Deletion requests", () => {
  beforeEach(() => {
    search.value = new URLSearchParams();
    vi.mocked(adminPrivacyService.deletionRequests).mockReset().mockResolvedValue(ROWS);
    vi.mocked(adminPrivacyService.transition).mockReset().mockResolvedValue({ id: "r1", state: "PENDING_RETENTION", stateChangedAt: day(0), stateNote: null });
  });

  it("lists new requests with their impact and moves one into retention review with a note", async () => {
    renderWithIntl(<AdminDeletionRequestsView />);
    const card = (await screen.findByRole("link", { name: "Sara" })).closest("li")!;
    expect(within(card).getByText(/9 days ago/)).toBeTruthy();
    expect(within(card).getByText("1 household · 3 pets · 1 shared with others")).toBeTruthy();
    expect(within(card).getByText(/Sole owner of a household/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "New · 1" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/nothing here deletes data/)).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Start retention review" }));
    fireEvent.change(within(card).getByLabelText("Note (optional)"), { target: { value: "Checked with finance" } });
    fireEvent.click(within(card).getByRole("button", { name: "Start retention review" }));
    await waitFor(() => expect(adminPrivacyService.transition).toHaveBeenCalledWith("r1", "PENDING_RETENTION", "Checked with finance"));
    expect(await screen.findByText("Sara's request is in retention review; they've been notified.")).toBeTruthy();
  });

  it("explains why a request can't be marked ready before the retention policy is approved", async () => {
    vi.mocked(adminPrivacyService.transition).mockRejectedValue(new ApiError({ code: "VALIDATION_ERROR", message: "x", requestId: "r", details: { reason: "RETENTION_POLICY_NOT_APPROVED" } }, 400));
    renderWithIntl(<AdminDeletionRequestsView />);
    await screen.findByRole("link", { name: "Sara" });
    fireEvent.click(screen.getByRole("button", { name: "Retention review · 1" }));
    const card = screen.getByRole("link", { name: "Omid" }).closest("li")!;
    expect(within(card).getByText(/Invoices kept for tax law/)).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Mark ready for deletion" }));
    fireEvent.click(within(card).getByRole("button", { name: "Mark ready for deletion" }));
    expect((await within(card).findByRole("alert")).textContent).toContain("a retention policy has to be approved");
  });

  it("opens on the request a task points to, and tells non-super-admins they can't handle these", async () => {
    search.value = new URLSearchParams("focus=r2");
    renderWithIntl(<AdminDeletionRequestsView />);
    expect(await screen.findByRole("link", { name: "Omid" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retention review · 1" }).getAttribute("aria-pressed")).toBe("true");
    vi.mocked(adminPrivacyService.deletionRequests).mockRejectedValue(new ApiError({ code: "ADMIN_ACCESS_DENIED", message: "x", requestId: "r" }, 403));
    renderWithIntl(<AdminDeletionRequestsView />, "fa");
    expect(await screen.findByText("فقط مدیر ارشد می‌تواند درخواست‌های حذف را رسیدگی کند.")).toBeTruthy();
  });
});
