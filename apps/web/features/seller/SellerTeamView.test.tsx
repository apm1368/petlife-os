import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { SellerTeamMemberDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { renderWithIntl } from "@/test/render-with-intl";
import { sellerOsService } from "@/services/seller-os.service";
import { useSellerStore } from "@/stores/seller-store";
import { SellerTeamView } from "./SellerTeamView";

vi.mock("@/services/seller-os.service", () => ({ sellerOsService: { listTeam: vi.fn(), inviteTeamMember: vi.fn(), updateTeamMemberRole: vi.fn(), removeTeamMember: vi.fn() } }));

const OWNER: SellerTeamMemberDto = { sellerMembershipId: "m-1", userId: "u-1", displayName: "Ali Owner", role: "OWNER" as never, status: "ACTIVE" as never, invitedAt: "2026-01-01T00:00:00.000Z", acceptedAt: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" };

describe("SellerTeamView", () => {
  beforeEach(() => {
    vi.mocked(sellerOsService.listTeam).mockReset();
    vi.mocked(sellerOsService.updateTeamMemberRole).mockReset();
    useSellerStore.setState({
      context: { active: { sellerMembershipId: "m-1", sellerOrganizationId: "seller-1", organizationName: "Pet Bazaar", verificationStatus: "VERIFIED" as never, sellerStatus: "ACTIVE" as never, role: "OWNER" as never }, memberships: [] },
      status: "ready",
    });
  });

  it("lists team members with their role and status", async () => {
    vi.mocked(sellerOsService.listTeam).mockResolvedValue([OWNER]);

    renderWithIntl(<SellerTeamView />);

    await waitFor(() => expect(screen.getByText("Ali Owner")).toBeTruthy());
    expect(screen.getByText("Active")).toBeTruthy();
  });

  it("reloads the true server state when the last-owner safeguard rejects a role change", async () => {
    vi.mocked(sellerOsService.listTeam).mockResolvedValue([OWNER]);
    vi.mocked(sellerOsService.updateTeamMemberRole).mockRejectedValue(new ApiError({ code: "SELLER_LAST_OWNER", message: "last owner", requestId: "r1" }, 409));

    renderWithIntl(<SellerTeamView />);
    await waitFor(() => expect(screen.getByText("Ali Owner")).toBeTruthy());

    const roleSelects = screen.getAllByLabelText("Role");
    fireEvent.change(roleSelects[roleSelects.length - 1]!, { target: { value: "VIEWER" } });

    await waitFor(() => expect(sellerOsService.updateTeamMemberRole).toHaveBeenCalledWith("seller-1", "m-1", "VIEWER"));
    // The safeguard rejected it server-side — a reload confirms the member is still OWNER, not silently left as VIEWER in the UI.
    await waitFor(() => expect(sellerOsService.listTeam).toHaveBeenCalledTimes(2));
  });
});
