import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { MedicalDocumentDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { HealthDocumentDetailView } from "./HealthDocumentDetailView";

vi.mock("@/services/health-advanced.service", () => ({
  healthAdvancedService: { getDocument: vi.fn(), downloadDocument: vi.fn(), createCorrection: vi.fn(), voidDocument: vi.fn() },
}));
vi.mock("@/hooks/use-pet-access", () => ({ usePetAccess: () => ({ access: null }) }));

const doc = {
  id: "doc-1", petId: "pet-1", householdId: "household-1", documentType: "LAB_REPORT", title: "Blood test",
  description: "Results as recorded by the clinic.", sourceType: "PROVIDER", source: { providerOrganizationId: "clinic-1", providerOrganizationName: "Clinic Name", providerUserId: null, providerUserDisplayTitle: null, userId: null },
  recordedAt: "2026-08-01T00:00:00.000Z", uploadedAt: "2026-08-01T00:00:00.000Z", mimeType: "application/pdf", fileSizeBytes: 1024,
  visibility: "HOUSEHOLD_ONLY", verificationStatus: "PROVIDER_VERIFIED", relatedVisitId: null, relatedLabResultId: null,
  relatedImagingStudyId: null, relatedReferralId: null, voidedAt: null, voidedReason: null,
} as MedicalDocumentDto;

describe("HealthDocumentDetailView localization", () => {
  beforeEach(() => vi.mocked(healthAdvancedService.getDocument).mockReset());

  it.each([
    ["de", "Zurück zu den Dokumenten", "Laborbericht", "Datenschutz", "Diese Datei ist privat"],
    ["es", "Volver a los documentos", "Informe de laboratorio", "Privacidad", "Este archivo es privado"],
  ] as const)("renders application-owned detail text in %s without translating clinical content", async (locale, back, kind, privacy, noticePrefix) => {
    vi.mocked(healthAdvancedService.getDocument).mockResolvedValue(doc);
    renderWithIntl(<HealthDocumentDetailView petId="pet-1" documentId="doc-1" />, locale);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Blood test" })).toBeTruthy());
    expect(screen.getByText(back)).toBeTruthy();
    expect(screen.getByText(kind)).toBeTruthy();
    expect(screen.getByText(privacy)).toBeTruthy();
    expect(screen.getByText(new RegExp(noticePrefix))).toBeTruthy();
    expect(screen.getByText("Clinic Name")).toBeTruthy();
    expect(screen.getByText("Results as recorded by the clinic.")).toBeTruthy();
  });
});
