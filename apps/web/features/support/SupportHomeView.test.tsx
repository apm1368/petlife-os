import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { supportService } from "@/services/support.service";
import { SupportHomeView } from "./SupportHomeView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/support.service", () => ({ supportService: { list: vi.fn() } }));

describe("SupportHomeView", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(supportService.list).mockReset();
  });

  it("shows a create-ticket CTA and no recent tickets when there are none", async () => {
    vi.mocked(supportService.list).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 3 });

    renderWithIntl(<SupportHomeView />);

    await waitFor(() => expect(screen.getByText("You have no support tickets yet.")).toBeTruthy());
    expect(screen.getByText("Get support")).toBeTruthy();
  });

  it("routes to the new-ticket page when the CTA is clicked", async () => {
    vi.mocked(supportService.list).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 3 });

    renderWithIntl(<SupportHomeView />);

    await waitFor(() => expect(screen.getByText("Get support")).toBeTruthy());
    screen.getByText("Get support").click();

    expect(push).toHaveBeenCalledWith("/en/support/new");
  });
});
