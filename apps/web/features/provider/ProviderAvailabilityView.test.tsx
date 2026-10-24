import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ApiError } from "@/lib/api/client";
import { providerOsService } from "@/services/provider-os.service";
import { ProviderAvailabilityView } from "./ProviderAvailabilityView";

vi.mock("@/services/provider-os.service", () => ({
  providerOsService: {
    listAvailabilityRules: vi.fn(),
    listAvailabilityExceptions: vi.fn(),
    createAvailabilityRule: vi.fn(),
    updateAvailabilityRule: vi.fn(),
    updateAvailabilityException: vi.fn(),
    deleteAvailabilityRule: vi.fn(),
    createAvailabilityException: vi.fn(),
    deleteAvailabilityException: vi.fn(),
  },
}));

describe("ProviderAvailabilityView", () => {
  beforeEach(() => {
    vi.mocked(providerOsService.listAvailabilityRules).mockReset().mockResolvedValue([]);
    vi.mocked(providerOsService.listAvailabilityExceptions).mockReset().mockResolvedValue([]);
    vi.mocked(providerOsService.createAvailabilityException).mockReset();
  });

  it("requires explicit acknowledgement before creating a conflicting BLOCKED exception, then proceeds without cancelling anything", async () => {
    vi.mocked(providerOsService.createAvailabilityException)
      .mockRejectedValueOnce(new ApiError({ code: "AVAILABILITY_CONFLICT", message: "conflict", requestId: "r1", details: { count: 3 } }, 409))
      .mockResolvedValueOnce({ id: "exc-1", providerOrganizationId: "org-1", locationId: "loc-1", providerUserId: null, startAt: "2026-09-05T09:00:00.000Z", endAt: "2026-09-05T10:00:00.000Z", type: "BLOCKED" as never, reason: "Closed" });

    renderWithIntl(<ProviderAvailabilityView />);
    await waitFor(() => expect(screen.getByText("Time off & extra availability")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Location ID"), { target: { value: "loc-1" } });
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-09-05T09:00" } });
    fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "2026-09-05T10:00" } });
    const addButtons = screen.getAllByRole("button", { name: "Add" });
    fireEvent.click(addButtons[addButtons.length - 1]!);

    await waitFor(() => expect(screen.getByText("3 confirmed bookings exist in this period. Blocking it will not cancel or move them.")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Block anyway" }));

    await waitFor(() => expect(providerOsService.createAvailabilityException).toHaveBeenLastCalledWith(expect.objectContaining({ acknowledgeConflict: true })));
  });
});

it("edits an existing rule without creating a duplicate", async () => {
 vi.mocked(providerOsService.listAvailabilityRules).mockResolvedValue([{id:"r1",locationId:"loc1",dayOfWeek:1,startLocalTime:"09:00",endLocalTime:"17:00",timezone:"Asia/Tehran"}] as never);
 vi.mocked(providerOsService.listAvailabilityExceptions).mockResolvedValue([]);
 vi.mocked(providerOsService.updateAvailabilityRule).mockResolvedValue({} as never);
 vi.mocked(providerOsService.createAvailabilityRule).mockClear();
 renderWithIntl(<ProviderAvailabilityView/>);
 fireEvent.click(await screen.findByRole("button",{name:"Edit"}));
 fireEvent.change(screen.getByLabelText("End time"),{target:{value:"18:00"}});
 fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
 await waitFor(()=>expect(providerOsService.updateAvailabilityRule).toHaveBeenCalledWith("r1",expect.objectContaining({endLocalTime:"18:00",timezone:"Asia/Tehran"})));
 expect(providerOsService.createAvailabilityRule).not.toHaveBeenCalled();
});
