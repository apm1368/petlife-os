import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import type { ProviderServiceDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { providerOsService } from "@/services/provider-os.service";
import { ProviderServicesView } from "./ProviderServicesView";

vi.mock("@/services/provider-os.service", () => ({ providerOsService: { listServices: vi.fn(), updateService: vi.fn() } }));

const SERVICE: ProviderServiceDto = {
  id: "svc-1",
  providerOrganizationId: "org-1",
  locationId: "loc-1",
  name: "Full Groom",
  description: null,
  type: "GROOMING_SESSION" as never,
  category: "GROOMING" as never,
  durationMinutes: 60,
  priceAmount: 500000,
  currency: "IRR",
  supportsDog: true,
  supportsCat: true,
  minAgeMonths: null,
  maxAgeMonths: null,
  minWeightKg: null,
  maxWeightKg: null,
  requiresCareProfile: false,
  requiresHealthBasics: false,
  locationMode: "AT_PROVIDER" as never,
  isActive: true,
};

describe("ProviderServicesView", () => {
  beforeEach(() => {
    vi.mocked(providerOsService.listServices).mockReset();
    vi.mocked(providerOsService.updateService).mockReset();
  });

  it("lists services and toggles a service's active state", async () => {
    vi.mocked(providerOsService.listServices).mockResolvedValue([SERVICE]);
    vi.mocked(providerOsService.updateService).mockResolvedValue({ ...SERVICE, isActive: false });

    renderWithIntl(<ProviderServicesView />);

    await waitFor(() => expect(screen.getByText("Full Groom")).toBeTruthy());
    expect(screen.getByText("Active")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Disable" }));

    await waitFor(() => expect(providerOsService.updateService).toHaveBeenCalledWith("svc-1", { isActive: false }));
    await waitFor(() => expect(screen.getByText("Disabled")).toBeTruthy());
  });
});
