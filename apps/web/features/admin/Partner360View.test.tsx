import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { AdminPartner360Dto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminService } from "@/services/admin.service";
import { Partner360View } from "./Partner360View";

vi.mock("@/services/admin.service", () => ({ adminService: { getPartner360: vi.fn(), transitionProviderVerification: vi.fn(), transitionSellerVerification: vi.fn() } }));

const PARTNER: AdminPartner360Dto = {
  id: "provider-1", kind: "PROVIDER", name: "Mehr Vet", type: "VET_CLINIC", verificationStatus: "UNDER_REVIEW", operationalStatus: "ACTIVE",
  locationSummary: "Tehran", contactEmail: "ops@example.com", contactPhone: "02100000000", createdAt: "2026-01-01T00:00:00.000Z",
  team: [{ id: "member-1", displayName: "Dr. Sara", role: "VET", status: "BOOKABLE" }],
  activity: [{ key: "services", count: 4 }, { key: "bookings", count: 12 }], auditReferences: [],
};

describe("Partner360View", () => {
  beforeEach(() => {
    vi.mocked(adminService.getPartner360).mockReset().mockResolvedValue(PARTNER);
    vi.mocked(adminService.transitionProviderVerification).mockReset().mockResolvedValue({ id: PARTNER.id, verificationStatus: "VERIFIED" as never });
  });

  it("renders real partner operations and localizes operator labels", async () => {
    renderWithIntl(<Partner360View kind="providers" partnerId={PARTNER.id} />);
    await waitFor(() => expect(screen.getByText("Mehr Vet")).toBeTruthy());
    expect(screen.getByText("Vet clinic")).toBeTruthy();
    expect(screen.getByText("Dr. Sara")).toBeTruthy();
    expect(screen.getByText("Active services")).toBeTruthy();
  });

  it("requires a reason before changing verification and sends the audited decision", async () => {
    renderWithIntl(<Partner360View kind="providers" partnerId={PARTNER.id} />);
    await waitFor(() => expect(screen.getByText("Mehr Vet")).toBeTruthy());
    const submit = screen.getByRole("button", { name: "Update" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Change verification status"), { target: { value: "VERIFIED" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Documents confirmed" } });
    fireEvent.click(submit);
    await waitFor(() => expect(adminService.transitionProviderVerification).toHaveBeenCalledWith(PARTNER.id, "VERIFIED", "Documents confirmed"));
  });
});
