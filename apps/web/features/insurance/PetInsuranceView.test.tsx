import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import type { InsuranceApplicationDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { insuranceService } from "@/services/insurance.service";
import { PetInsuranceView } from "./PetInsuranceView";

vi.mock("@/services/insurance.service", () => ({ insuranceService: { listApplications: vi.fn(), submitApplication: vi.fn(), cancelApplication: vi.fn() } }));

function application(overrides: Partial<InsuranceApplicationDto> = {}): InsuranceApplicationDto {
  return {
    id: "application-1",
    productId: "product-1",
    productName: "Basic Plan",
    providerName: "Acme Insurance",
    householdId: "household-1",
    petId: "pet-1",
    petName: "Rex",
    applicantUserId: "user-1",
    status: "DRAFT" as never,
    eligibilityStatus: "POSSIBLY_ELIGIBLE" as never,
    notes: null,
    submittedAt: null,
    decidedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("PetInsuranceView", () => {
  beforeEach(() => {
    vi.mocked(insuranceService.listApplications).mockReset();
    vi.mocked(insuranceService.submitApplication).mockReset();
  });

  it("never shows a submitted application as approved or declined — only its real status", async () => {
    vi.mocked(insuranceService.listApplications).mockResolvedValue([application({ status: "SUBMITTED" as never })]);

    renderWithIntl(<PetInsuranceView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("Acme Insurance — Basic Plan")).toBeTruthy());
    expect(screen.getByText("Submitted")).toBeTruthy();
    expect(screen.queryByText("Approved")).toBeNull();
    expect(screen.queryByText("Declined")).toBeNull();
  });

  it("submits a draft application and reloads the list", async () => {
    vi.mocked(insuranceService.listApplications).mockResolvedValueOnce([application()]).mockResolvedValueOnce([application({ status: "SUBMITTED" as never })]);
    vi.mocked(insuranceService.submitApplication).mockResolvedValue(application({ status: "SUBMITTED" as never }));

    renderWithIntl(<PetInsuranceView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("Submit application")).toBeTruthy());
    fireEvent.click(screen.getByText("Submit application"));

    await waitFor(() => expect(insuranceService.submitApplication).toHaveBeenCalledWith("pet-1", "application-1"));
  });

  it("shows a localized empty state when there are no applications", async () => {
    vi.mocked(insuranceService.listApplications).mockResolvedValue([]);

    renderWithIntl(<PetInsuranceView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("No applications yet.")).toBeTruthy());
  });
});
