import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { TreatmentTaskStatus, TreatmentTaskType, type HospitalizationDetailDto, type TreatmentTaskDto } from "@petlife/types";
import { vetPanelService } from "@/services/vet-panel.service";
import { VetTreatmentSheetView } from "./VetTreatmentSheetView";

vi.mock("@/services/vet-panel.service", () => ({
  vetPanelService: { getHospitalization: vi.fn(), actionTask: vi.fn(), dischargePatient: vi.fn(), scheduleTaskSeries: vi.fn() },
}));

function task(overrides: Partial<TreatmentTaskDto> = {}): TreatmentTaskDto {
  return {
    id: "task-1",
    hospitalizationId: "hosp-1",
    type: TreatmentTaskType.MEDICATION,
    title: "Buprenorphine",
    detail: null,
    prescriptionId: null,
    scheduledAt: "2026-09-12T06:00:00.000Z",
    status: TreatmentTaskStatus.SCHEDULED,
    completedAt: null,
    completedByProviderUserId: null,
    outcomeNote: null,
    isOverdue: true,
    createdAt: "2026-09-12T05:00:00.000Z",
    updatedAt: "2026-09-12T05:00:00.000Z",
    ...overrides,
  };
}

function detail(tasks: TreatmentTaskDto[]): HospitalizationDetailDto {
  return {
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
    triageLevel: null,
    admittedAt: "2026-09-12T05:00:00.000Z",
    estimatedDischargeAt: null,
    dischargedAt: null,
    dischargeNote: null,
    cancelledReason: null,
    createdAt: "2026-09-12T05:00:00.000Z",
    updatedAt: "2026-09-12T05:00:00.000Z",
    tasks,
    vitals: [],
    taskCounts: {
      scheduled: tasks.filter((t) => t.status === TreatmentTaskStatus.SCHEDULED).length,
      overdue: tasks.filter((t) => t.isOverdue).length,
      done: tasks.filter((t) => t.status === TreatmentTaskStatus.DONE).length,
      skipped: tasks.filter((t) => t.status === TreatmentTaskStatus.SKIPPED).length,
      missed: tasks.filter((t) => t.status === TreatmentTaskStatus.MISSED).length,
    },
  };
}

describe("VetTreatmentSheetView", () => {
  beforeEach(() => {
    vi.mocked(vetPanelService.getHospitalization).mockReset();
    vi.mocked(vetPanelService.actionTask).mockReset();
  });

  it("offers all three outcomes on a scheduled task, keeping 'skipped' and 'missed' distinct", async () => {
    vi.mocked(vetPanelService.getHospitalization).mockResolvedValue(detail([task()]));

    renderWithIntl(<VetTreatmentSheetView hospitalizationId="hosp-1" petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("Buprenorphine")).toBeTruthy());
    expect(screen.getByText("Done")).toBeTruthy();
    expect(screen.getByText("Skipped")).toBeTruthy();
    expect(screen.getByText("Missed")).toBeTruthy();
  });

  it("marks an unactioned past-due task as overdue rather than silently closing it", async () => {
    vi.mocked(vetPanelService.getHospitalization).mockResolvedValue(detail([task()]));

    renderWithIntl(<VetTreatmentSheetView hospitalizationId="hosp-1" petId="pet-1" />);

    await waitFor(() => expect(screen.getAllByText("Overdue").length).toBeGreaterThan(0));
    expect(screen.getByText("1 overdue")).toBeTruthy();
  });

  it("removes the action buttons once an outcome is recorded, so a recorded act of care cannot be re-stated", async () => {
    vi.mocked(vetPanelService.getHospitalization).mockResolvedValue(
      detail([task({ status: TreatmentTaskStatus.DONE, isOverdue: false, completedAt: "2026-09-12T06:10:00.000Z", outcomeNote: "Given IV" })]),
    );

    renderWithIntl(<VetTreatmentSheetView hospitalizationId="hosp-1" petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("Given IV")).toBeTruthy());
    expect(screen.queryByText("Skipped")).toBeNull();
    expect(screen.queryByText("Missed")).toBeNull();
  });

  it("records the chosen outcome for the task", async () => {
    vi.mocked(vetPanelService.getHospitalization).mockResolvedValue(detail([task()]));
    vi.mocked(vetPanelService.actionTask).mockResolvedValue(task({ status: TreatmentTaskStatus.DONE }));

    renderWithIntl(<VetTreatmentSheetView hospitalizationId="hosp-1" petId="pet-1" />);
    await waitFor(() => expect(screen.getByText("Done")).toBeTruthy());

    fireEvent.click(screen.getByText("Done"));

    await waitFor(() =>
      expect(vetPanelService.actionTask).toHaveBeenCalledWith("hosp-1", "task-1", expect.objectContaining({ petId: "pet-1", status: TreatmentTaskStatus.DONE })),
    );
  });

  it("shows no compliance percentage — only the raw counts", async () => {
    vi.mocked(vetPanelService.getHospitalization).mockResolvedValue(
      detail([task({ id: "t1", status: TreatmentTaskStatus.DONE, isOverdue: false }), task({ id: "t2" })]),
    );

    const { container } = renderWithIntl(<VetTreatmentSheetView hospitalizationId="hosp-1" petId="pet-1" />);
    await waitFor(() => expect(screen.getByText("1 done")).toBeTruthy());

    expect(container.textContent ?? "").not.toContain("%");
  });
});
