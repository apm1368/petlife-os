import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { AdminReviewModerationRowDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { useAdminStore } from "@/stores/admin-store";
import { adminReviewModerationService } from "@/services/admin-review-moderation.service";
import { AdminReviewModerationView } from "./AdminReviewModerationView";

vi.mock("@/services/admin-review-moderation.service", () => ({
  adminReviewModerationService: { list: vi.fn(), approve: vi.fn(), reject: vi.fn() },
}));

const row: AdminReviewModerationRowDto = {
  id: "review-1",
  vertical: "SERVICE",
  status: "PENDING",
  rating: 4,
  body: "Kind and careful team",
  authorName: "Sara",
  target: { id: "clinic-1", name: "Happy Paws" },
  labels: [],
  moderationReason: null,
  createdAt: "2026-10-27T10:00:00.000Z",
  moderatedAt: null,
};

function admin(permissions: string[]) {
  useAdminStore.setState({
    status: "ready",
    context: {
      isAdmin: true,
      adminUserId: "admin-1",
      displayName: "Admin",
      role: "ADMIN",
      permissions,
    } as never,
  });
}

describe("AdminReviewModerationView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminReviewModerationService.list).mockResolvedValue({
      items: [row],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    vi.mocked(adminReviewModerationService.approve).mockResolvedValue({ ...row, status: "APPROVED" });
    vi.mocked(adminReviewModerationService.reject).mockResolvedValue({
      ...row,
      status: "REJECTED",
      moderationReason: "Promotional content",
    });
  });

  it("shows only allowed vertical tabs and hides decisions from view-only admins", async () => {
    admin(["services.view", "commerce.view"]);
    renderWithIntl(<AdminReviewModerationView initialVertical="SERVICE" />);
    expect(await screen.findByText("Happy Paws")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Services" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Products" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Travel & stays" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(adminReviewModerationService.list).toHaveBeenCalledWith(
      expect.objectContaining({ vertical: "SERVICE", status: "PENDING" }),
      expect.any(AbortSignal),
    );
  });

  it("approves with normalized labels through the moderation contract", async () => {
    admin(["services.view", "services.manage"]);
    renderWithIntl(<AdminReviewModerationView initialVertical="SERVICE" />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    fireEvent.change(screen.getByLabelText("Labels (comma-separated)"), {
      target: { value: "verified, quality" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve and publish" }));
    await waitFor(() =>
      expect(adminReviewModerationService.approve).toHaveBeenCalledWith("SERVICE", "review-1", {
        reason: undefined,
        labels: ["verified", "quality"],
      }),
    );
  });

  it("requires a useful reason before rejecting", async () => {
    admin(["services.view", "services.manage"]);
    renderWithIntl(<AdminReviewModerationView initialVertical="SERVICE" />);
    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    const submit = screen.getByRole("button", { name: "Reject review" });
    expect(submit.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Rejection reason (required)"), {
      target: { value: "Promotional content" },
    });
    fireEvent.click(submit);
    await waitFor(() =>
      expect(adminReviewModerationService.reject).toHaveBeenCalledWith("SERVICE", "review-1", {
        reason: "Promotional content",
        labels: [],
      }),
    );
  });
});
