import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import type { ClinicalDashboardDto, HospitalizationDto, WhiteboardPatientDto } from "@petlife/types";
import { vetPanelService } from "@/services/vet-panel.service";
import { ApiError } from "@/lib/api/client";
import { VetClinicalDashboardView } from "./VetClinicalDashboardView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/vet-panel.service", () => ({ vetPanelService: { getDashboard: vi.fn() } }));

const HOSPITALIZATION: HospitalizationDto = {
  id: "hosp-1",
  petId: "pet-1",
  petName: "Milo",
  species: "CAT" as never,
  providerOrganizationId: "org-1",
  attendingProviderUserId: null,
  attendingProviderDisplayTitle: null,
  clinicalVisitId: null,
  status: "ADMITTED" as never,
  reasonForAdmission: "Post-operative monitoring",
  kennelLabel: "K3",
  triageLevel: "URGENT" as never,
  admittedAt: "2026-09-12T06:00:00.000Z",
  estimatedDischargeAt: null,
  dischargedAt: null,
  dischargeNote: null,
  cancelledReason: null,
  createdAt: "2026-09-12T06:00:00.000Z",
  updatedAt: "2026-09-12T06:00:00.000Z",
};

function dashboard(overrides: Partial<ClinicalDashboardDto> = {}): ClinicalDashboardDto {
  return {
    organizationId: "org-1",
    todaysVetBookingCount: 4,
    openVisits: [],
    whiteboard: [],
    overdueTreatmentTasks: [],
    pendingEstimates: [],
    unresolvedAlertCount: 0,
    dueFollowUps: [],
    ...overrides,
  };
}

function whiteboardRow(overrides: Partial<WhiteboardPatientDto> = {}): WhiteboardPatientDto {
  return { hospitalization: HOSPITALIZATION, dueTaskCount: 2, overdueTaskCount: 1, nextTaskAt: null, latestVitalsAt: null, ...overrides };
}

describe("VetClinicalDashboardView", () => {
  beforeEach(() => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    push.mockReset();
    vi.mocked(vetPanelService.getDashboard).mockReset();
  });

  it("says an inpatient has no vitals yet rather than implying they are stable", async () => {
    vi.mocked(vetPanelService.getDashboard).mockResolvedValue(dashboard({ whiteboard: [whiteboardRow()] }));

    renderWithIntl(<VetClinicalDashboardView />);

    await waitFor(() => expect(screen.getByText("Milo")).toBeTruthy());
    expect(screen.getByText("No vitals recorded yet")).toBeTruthy();
    expect(screen.getByText("Kennel K3")).toBeTruthy();
    expect(screen.getByText("Urgent")).toBeTruthy();
  });

  it("shows an explicit empty board rather than a blank screen", async () => {
    vi.mocked(vetPanelService.getDashboard).mockResolvedValue(dashboard());

    renderWithIntl(<VetClinicalDashboardView />);

    await waitFor(() => expect(screen.getByText("No patients are admitted.")).toBeTruthy());
    expect(screen.getByText("Nothing overdue.")).toBeTruthy();
    expect(screen.getByText("No estimates are waiting on an owner.")).toBeTruthy();
  });

  it("shows no revenue or productivity figure anywhere on the board", async () => {
    vi.mocked(vetPanelService.getDashboard).mockResolvedValue(dashboard({ whiteboard: [whiteboardRow()] }));

    const { container } = renderWithIntl(<VetClinicalDashboardView />);
    await waitFor(() => expect(screen.getByText("Milo")).toBeTruthy());

    const text = container.textContent ?? "";
    for (const word of ["Revenue", "revenue", "Toman", "IRR"]) {
      expect(text).not.toContain(word);
    }
  });

  it.each([
    ["de", "Klinisches Board", "4 Termine heute", "Gerade in der Klinik", "Noch keine Vitalwerte erfasst"],
    ["es", "Panel clínico", "4 citas hoy", "Ahora en la clínica", "Aún no se han registrado constantes vitales"],
  ] as const)("renders the clinical dashboard body in %s without Persian UI fallback", async (locale, title, appointments, whiteboard, noVitals) => {
    vi.mocked(vetPanelService.getDashboard).mockResolvedValue(dashboard({ whiteboard: [whiteboardRow()] }));
    const { container } = renderWithIntl(<VetClinicalDashboardView />, locale);

    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByText(appointments)).toBeTruthy();
    expect(screen.getByText(whiteboard)).toBeTruthy();
    expect(screen.getByText(noVitals)).toBeTruthy();
    expect(container.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([
    ["de", "Wird geladen"],
    ["es", "Cargando"],
  ] as const)("localizes the clinical dashboard loading state in %s", (locale, loadingLabel) => {
    vi.mocked(vetPanelService.getDashboard).mockImplementationOnce(() => new Promise(() => undefined));
    renderWithIntl(<VetClinicalDashboardView />, locale);
    expect(screen.getByLabelText(loadingLabel)).toBeTruthy();
  });

  it.each([
    ["de", "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut."],
    ["es", "Algo salió mal. Inténtalo de nuevo."],
  ] as const)("shows a localized clinical dashboard load error in %s", async (locale, errorMessage) => {
    vi.mocked(vetPanelService.getDashboard).mockRejectedValueOnce(new Error("internal English provider detail"));
    renderWithIntl(<VetClinicalDashboardView />, locale);
    expect(await screen.findByText(errorMessage)).toBeTruthy();
    expect(screen.queryByText("internal English provider detail")).toBeNull();
  });

  it.each([
    ["de", "Du hast keine Berechtigung für dieses klinische Dashboard."],
    ["es", "No tienes permiso para ver este panel clínico."],
  ] as const)("localizes clinical dashboard no-access state in %s", async (locale, message) => {
    vi.mocked(vetPanelService.getDashboard).mockRejectedValueOnce(new ApiError({ code: "FORBIDDEN", message: "Forbidden in English", requestId: "r2" }, 403));
    renderWithIntl(<VetClinicalDashboardView />, locale);
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText("Forbidden in English")).toBeNull();
  });

  it.each([
    ["de", "Du bist offline. Prüfe deine Verbindung und versuche es erneut."],
    ["es", "No tienes conexión. Comprueba la conexión e inténtalo de nuevo."],
  ] as const)("shows an explicit clinical dashboard offline state in %s", async (locale, message) => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    vi.mocked(vetPanelService.getDashboard).mockRejectedValueOnce(new Error("Failed to fetch"));
    renderWithIntl(<VetClinicalDashboardView />, locale);
    expect(await screen.findByText(message)).toBeTruthy();
  });
});
