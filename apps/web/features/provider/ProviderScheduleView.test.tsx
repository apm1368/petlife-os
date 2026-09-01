import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { providerOsService } from "@/services/provider-os.service";
import { ProviderScheduleView } from "./ProviderScheduleView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/provider-os.service", () => ({ providerOsService: { listBookings: vi.fn() } }));

describe("ProviderScheduleView", () => {
  beforeEach(() => {
    vi.mocked(providerOsService.listBookings).mockReset();
  });

  it("loads Today by default, then switches to Week", async () => {
    vi.mocked(providerOsService.listBookings).mockResolvedValue([]);

    renderWithIntl(<ProviderScheduleView />);

    await waitFor(() => expect(providerOsService.listBookings).toHaveBeenCalledWith({ today: true }));

    fireEvent.click(screen.getByRole("button", { name: "Week" }));
    await waitFor(() => expect(providerOsService.listBookings).toHaveBeenCalledWith({ upcoming: true }));
  });
});
