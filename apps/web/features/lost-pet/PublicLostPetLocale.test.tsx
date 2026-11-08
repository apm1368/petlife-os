import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { lostPetService } from "@/services/lost-pet.service";
import { ApiError } from "@/lib/api/client";
import { PublicLostPetListView } from "./PublicLostPetListView";
import { PublicLostPetView } from "./PublicLostPetView";

vi.mock("@/services/lost-pet.service", () => ({
  lostPetService: {
    listPublic: vi.fn(), getPublic: vi.fn(), submitSighting: vi.fn(), requestSightingPhotoUpload: vi.fn(),
  },
}));
vi.mock("@/features/shared/ReportContentPanel", () => ({ ReportContentPanel: () => <div /> }));
vi.mock("@/features/shared/ShareBar", () => ({ ShareBar: () => <div /> }));

const report = {
  id: "incident-1", status: "OPEN", petName: "Milo", petSpecies: "DOG", petBreed: "Mixed", petColorMarkings: "Brown",
  petApproximateAgeMonths: 24, approximateArea: "North district", lastSeenAt: "2026-11-01T08:00:00.000Z",
  primaryPhotoUrl: null, publicNotes: "Shy", publicContactMode: null,
} as never;

describe("public lost-pet pages in all route locales", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["fa", "en", "de", "es"] as const)("renders list filters and empty state in %s", async (locale) => {
    vi.mocked(lostPetService.listPublic).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 12 } as never);
    renderWithIntl(<PublicLostPetListView />, locale);

    expect(await screen.findByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.getByRole("group")).toBeTruthy();
    expect(screen.getByText(locale === "de" ? "Zurzeit gibt es keine aktiven Meldungen zu vermissten Tieren." : locale === "es" ? "Ahora mismo no hay informes activos de mascotas perdidas." : locale === "fa" ? "در حال حاضر گزارش فعالی از حیوان گم‌شده ثبت نشده است." : "There are no active lost-pet reports right now.")).toBeTruthy();
    if (locale === "de" || locale === "es") expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each(["de", "es"] as const)("renders full public report and sighting form without Persian UI in %s", async (locale) => {
    vi.mocked(lostPetService.getPublic).mockResolvedValue(report);
    renderWithIntl(<PublicLostPetView incidentId="incident-1" />, locale);

    expect(await screen.findByRole("heading", { name: locale === "de" ? "Milo wird vermisst" : "Milo está desaparecida" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: locale === "de" ? "Sichtung melden" : "Informar de un avistamiento" })).toBeTruthy();
    expect(screen.getByText(locale === "de" ? "Zuletzt gesehen in der Gegend" : "Última vez vista cerca de")).toBeTruthy();
    expect(screen.getByText(locale === "de" ? /Deine Meldung geht nur an/ : /El aviso solo se envía a/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it("localizes unavailable report state in German and Spanish", async () => {
    for (const locale of ["de", "es"] as const) {
      vi.mocked(lostPetService.getPublic).mockRejectedValueOnce(new ApiError({ code: "NOT_FOUND", message: "Not found", requestId: "test" }, 404));
      const { unmount } = renderWithIntl(<PublicLostPetView incidentId="missing" />, locale);
      await waitFor(() => expect(screen.getByText(locale === "de" ? "Diese Meldung ist nicht verfügbar" : "Este informe no está disponible")).toBeTruthy());
      expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
      unmount();
    }
  });
});
