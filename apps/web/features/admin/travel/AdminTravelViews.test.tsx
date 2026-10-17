import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ApiError } from "@/lib/api/client";
import { adminTravelService } from "@/services/travel-marketplace.service";
import { AdminTravelListingsView, AdminTravelRequirementsView } from "./AdminTravelViews";

vi.mock("next/navigation", () => ({ usePathname: () => "/fa/admin/travel" }));
vi.mock("@/services/travel-marketplace.service", () => ({ adminTravelService: { listings: vi.fn(), rules: vi.fn() }, adminInsuranceOpsService: {} }));

describe("admin travel", () => {
  it("shows a permission state instead of data for admins without travel.view", async () => {
    vi.mocked(adminTravelService.listings).mockRejectedValue(new ApiError({ code: "FORBIDDEN", message: "x", requestId: "r" }, 403));
    renderWithIntl(<AdminTravelListingsView />, "en");
    expect(await screen.findByText("travel.view permission required")).toBeTruthy();
  });

  it("flags stale requirement rules and shows their source", async () => {
    vi.mocked(adminTravelService.rules).mockResolvedValue([{ id: "r1", country: "IR", city: null, requirementType: "RABIES", title: "Rabies", description: "d", species: [], source: "IVO", sourceUrl: "https://ivo.ir", verifiedAt: "2025-01-01T00:00:00.000Z", validUntil: null, status: "ACTIVE", isStale: true }] as never);
    renderWithIntl(<AdminTravelRequirementsView />, "en");
    expect(await screen.findByText("Needs review")).toBeTruthy();
    expect(screen.getByRole("link", { name: "IVO" })).toBeTruthy();
  });
});
