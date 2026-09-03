import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { ImagingStudyDto, LabResultDto, ReferralDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { HealthLabsView } from "./HealthLabsView";
import { HealthImagingView } from "./HealthImagingView";
import { HealthReferralsView } from "./HealthReferralsView";

vi.mock("@/services/health-advanced.service", () => ({
  healthAdvancedService: { listLabs: vi.fn(), listImaging: vi.fn(), listReferrals: vi.fn() },
}));

const SOURCE = { providerOrganizationId: "org-1", providerOrganizationName: "Happy Paws Clinic", providerUserId: "pu-1", providerUserDisplayTitle: null, userId: null };

describe("HealthLabsView", () => {
  beforeEach(() => vi.mocked(healthAdvancedService.listLabs).mockReset());

  it("shows 'No lab results recorded' rather than a fabricated normal result when there are none", async () => {
    vi.mocked(healthAdvancedService.listLabs).mockResolvedValue([]);

    renderWithIntl(<HealthLabsView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("No lab results recorded.")).toBeTruthy());
    expect(screen.queryByText(/normal/i)).toBeNull();
  });

  it("only shows an abnormal/normal flag when the provider explicitly set one, never an inferred interpretation", async () => {
    const base: LabResultDto = {
      id: "lab-1",
      petId: "pet-1",
      source: SOURCE,
      clinicalVisitId: null,
      testName: "CBC Panel",
      testCode: null,
      sampleDate: null,
      resultDate: null,
      value: "5.2",
      unit: "10^9/L",
      referenceRangeLow: null,
      referenceRangeHigh: null,
      qualitativeResult: null,
      status: "COMPLETED" as never,
      flag: null,
      sourceType: "PROVIDER" as never,
      notes: null,
      supersedesId: null,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    };
    vi.mocked(healthAdvancedService.listLabs).mockResolvedValue([
      { ...base, id: "lab-no-flag" },
      { ...base, id: "lab-abnormal", flag: "ABNORMAL" as never },
    ]);

    renderWithIntl(<HealthLabsView petId="pet-1" />);

    await waitFor(() => expect(screen.getAllByText("CBC Panel").length).toBe(2));
    expect(screen.getByText("COMPLETED")).toBeTruthy();
    expect(screen.getByText("ABNORMAL")).toBeTruthy();
  });
});

describe("HealthImagingView", () => {
  beforeEach(() => vi.mocked(healthAdvancedService.listImaging).mockReset());

  it("shows 'No imaging studies recorded' when there are none", async () => {
    vi.mocked(healthAdvancedService.listImaging).mockResolvedValue([]);

    renderWithIntl(<HealthImagingView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("No imaging studies recorded.")).toBeTruthy());
  });

  it("shows the provider's free-text report only, never an automated diagnosis", async () => {
    const study: ImagingStudyDto = {
      id: "study-1",
      petId: "pet-1",
      source: SOURCE,
      clinicalVisitId: null,
      studyType: "XRAY" as never,
      bodyRegion: "Chest",
      performedAt: "2026-08-01T00:00:00.000Z",
      report: "No acute findings noted by radiologist.",
      findings: null,
      recommendation: null,
      sourceType: "PROVIDER" as never,
      voidedAt: null,
      voidedReason: null,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    };
    vi.mocked(healthAdvancedService.listImaging).mockResolvedValue([study]);

    renderWithIntl(<HealthImagingView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("XRAY")).toBeTruthy());
    expect(screen.getByText("No acute findings noted by radiologist.")).toBeTruthy();
  });
});

describe("HealthReferralsView", () => {
  beforeEach(() => vi.mocked(healthAdvancedService.listReferrals).mockReset());

  it("shows 'No referrals recorded' when there are none", async () => {
    vi.mocked(healthAdvancedService.listReferrals).mockResolvedValue([]);

    renderWithIntl(<HealthReferralsView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("No referrals recorded.")).toBeTruthy());
  });

  it("shows referral state independent of any booking status", async () => {
    const referral: ReferralDto = {
      id: "ref-1",
      petId: "pet-1",
      fromProviderOrganizationId: "org-1",
      fromProviderOrganizationName: "Happy Paws Clinic",
      fromProviderUserId: "pu-1",
      toProviderOrganizationId: null,
      toProviderOrganizationName: null,
      externalProviderName: "Tehran Specialty Vet",
      externalSpecialty: "Cardiology",
      reason: "Suspected heart murmur",
      notes: null,
      status: "SENT" as never,
      clinicalVisitId: null,
      fulfillingBookingId: null,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      completedAt: null,
      cancelledAt: null,
    };
    vi.mocked(healthAdvancedService.listReferrals).mockResolvedValue([referral]);

    renderWithIntl(<HealthReferralsView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("Suspected heart murmur")).toBeTruthy());
    expect(screen.getByText("SENT")).toBeTruthy();
    expect(screen.getByText("Tehran Specialty Vet")).toBeTruthy();
  });
});
