import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { SellerOrganizationDetailDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { sellerOsService } from "@/services/seller-os.service";
import { useSellerStore } from "@/stores/seller-store";
import { SellerSettingsView } from "./SellerSettingsView";

vi.mock("@/services/seller-os.service", () => ({
  sellerOsService: { getOrganization: vi.fn(), updateOrganization: vi.fn() },
}));

const ORGANIZATION = {
  id: "seller-1",
  name: "Pet Bazaar",
  supportContactEmail: "help@example.test",
  supportContactPhone: "+982100000000",
  timezone: "Asia/Tehran",
  city: "Tehran",
  description: "Pet supplies",
} as SellerOrganizationDetailDto;

describe("SellerSettingsView", () => {
  beforeEach(() => {
    vi.mocked(sellerOsService.getOrganization).mockReset();
    vi.mocked(sellerOsService.updateOrganization).mockReset();
    useSellerStore.setState({
      context: { active: { sellerMembershipId: "m-1", sellerOrganizationId: "seller-1", organizationName: "Pet Bazaar", verificationStatus: "VERIFIED" as never, sellerStatus: "ACTIVE" as never, role: "OWNER" as never }, memberships: [] },
      status: "ready",
    });
  });

  it("surfaces a retryable save error instead of silently swallowing the failed update", async () => {
    vi.mocked(sellerOsService.getOrganization).mockResolvedValue(ORGANIZATION);
    vi.mocked(sellerOsService.updateOrganization).mockRejectedValue(new Error("network unavailable"));

    renderWithIntl(<SellerSettingsView />);
    await waitFor(() => expect(screen.getByDisplayValue("Pet supplies")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't save these settings. Please try again.");
  });
});
