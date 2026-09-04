import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { MedicalDocumentDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { HealthDocumentsView } from "./HealthDocumentsView";

vi.mock("@/services/health-advanced.service", () => ({
  healthAdvancedService: { listDocuments: vi.fn(), requestDocumentUpload: vi.fn(), createDocument: vi.fn(), downloadDocument: vi.fn() },
}));

const SOURCE = { providerOrganizationId: null, providerOrganizationName: null, providerUserId: null, providerUserDisplayTitle: null, userId: "user-1" };

function makeDoc(overrides: Partial<MedicalDocumentDto> = {}): MedicalDocumentDto {
  return {
    id: "doc-1",
    petId: "pet-1",
    householdId: "household-1",
    documentType: "OTHER" as never,
    title: "Vet visit summary",
    description: null,
    sourceType: "OWNER" as never,
    source: SOURCE,
    recordedAt: null,
    uploadedAt: "2026-08-01T00:00:00.000Z",
    mimeType: "application/pdf",
    fileSizeBytes: 1024,
    visibility: "PRIVATE" as never,
    verificationStatus: "UNVERIFIED" as never,
    relatedVisitId: null,
    relatedLabResultId: null,
    relatedImagingStudyId: null,
    relatedReferralId: null,
    voidedAt: null,
    voidedReason: null,
    ...overrides,
  } as MedicalDocumentDto;
}

describe("HealthDocumentsView", () => {
  beforeEach(() => {
    vi.mocked(healthAdvancedService.listDocuments).mockReset();
    vi.mocked(healthAdvancedService.downloadDocument).mockReset();
    window.open = vi.fn();
  });

  it("shows an explicit empty state when there are no documents", async () => {
    vi.mocked(healthAdvancedService.listDocuments).mockResolvedValue([]);

    renderWithIntl(<HealthDocumentsView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("No medical documents uploaded yet.")).toBeTruthy());
  });

  it("shows a provider provenance badge for a provider-sourced document and an owner badge for an owner-sourced one", async () => {
    vi.mocked(healthAdvancedService.listDocuments).mockResolvedValue([
      makeDoc({ id: "doc-owner", title: "Owner upload", sourceType: "OWNER" as never }),
      makeDoc({ id: "doc-provider", title: "Provider upload", sourceType: "PROVIDER" as never }),
    ]);

    renderWithIntl(<HealthDocumentsView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("Owner upload")).toBeTruthy());
    expect(screen.getByText("Uploaded by household")).toBeTruthy();
    expect(screen.getByText("Uploaded by provider — verified")).toBeTruthy();
  });

  it("downloads via a freshly-minted signed URL rather than any stored link", async () => {
    vi.mocked(healthAdvancedService.listDocuments).mockResolvedValue([makeDoc()]);
    vi.mocked(healthAdvancedService.downloadDocument).mockResolvedValue({ downloadUrl: "https://signed.example/doc-1?sig=abc" } as never);

    renderWithIntl(<HealthDocumentsView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("Vet visit summary")).toBeTruthy());
    fireEvent.click(screen.getByText("Download"));

    await waitFor(() => expect(healthAdvancedService.downloadDocument).toHaveBeenCalledWith("pet-1", "doc-1"));
    expect(window.open).toHaveBeenCalledWith("https://signed.example/doc-1?sig=abc", "_blank", "noopener,noreferrer");
  });
});
