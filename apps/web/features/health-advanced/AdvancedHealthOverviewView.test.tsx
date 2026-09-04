import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { HealthOverviewDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { AdvancedHealthOverviewView } from "./AdvancedHealthOverviewView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/health-advanced.service", () => ({ healthAdvancedService: { getOverview: vi.fn() } }));

const BASE_OVERVIEW: HealthOverviewDto = {
  petId: "pet-1",
  upcomingCare: [],
  overdueCare: [],
  activeMedicationsCount: 0,
  unresolvedCarePlanItemsCount: 0,
  recentDocuments: [],
  recentVisits: [],
  missingInformation: [],
};

describe("AdvancedHealthOverviewView", () => {
  beforeEach(() => {
    vi.mocked(healthAdvancedService.getOverview).mockReset();
  });

  it("never renders a numeric health score anywhere on the page", async () => {
    vi.mocked(healthAdvancedService.getOverview).mockResolvedValue(BASE_OVERVIEW);

    renderWithIntl(<AdvancedHealthOverviewView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("Advanced Health")).toBeTruthy());
    expect(screen.queryByText(/health score/i)).toBeNull();
    expect(screen.getByText("No known gaps in this pet's recorded health information.")).toBeTruthy();
  });

  it("names missing information explicitly instead of defaulting to a reassuring blank state", async () => {
    vi.mocked(healthAdvancedService.getOverview).mockResolvedValue({
      ...BASE_OVERVIEW,
      overdueCare: [{ id: "care-1" } as never],
      unresolvedCarePlanItemsCount: 2,
      missingInformation: ["No allergy information recorded", "No medication information available"],
    });

    renderWithIntl(<AdvancedHealthOverviewView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("No allergy information recorded")).toBeTruthy());
    expect(screen.getByText("No medication information available")).toBeTruthy();
    expect(screen.queryByText("No known gaps in this pet's recorded health information.")).toBeNull();
  });

  it("renders correctly under the fa/RTL locale using real translated copy", async () => {
    vi.mocked(healthAdvancedService.getOverview).mockResolvedValue(BASE_OVERVIEW);

    renderWithIntl(<AdvancedHealthOverviewView petId="pet-1" />, "fa");

    await waitFor(() => expect(screen.getByText("سلامت پیشرفته")).toBeTruthy());
  });

  it("shows an error state with a retry action when the overview fails to load", async () => {
    vi.mocked(healthAdvancedService.getOverview).mockRejectedValue(new Error("network down"));

    renderWithIntl(<AdvancedHealthOverviewView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("Something went wrong. Please try again.")).toBeTruthy());
  });
});
