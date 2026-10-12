import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { petsService } from "@/services/pets.service";
import { careProfileService } from "@/services/care-profile.service";
import { healthService } from "@/services/health.service";
import { careRemindersService } from "@/services/care-reminders.service";
import { CareSheetView } from "./CareSheetView";

vi.mock("@/services/pets.service", () => ({ petsService: { getById: vi.fn(), getMyAccess: vi.fn() } }));
vi.mock("@/services/care-profile.service", () => ({ careProfileService: { get: vi.fn() } }));
vi.mock("@/services/health.service", () => ({ healthService: { listAllergies: vi.fn(), listMedications: vi.fn(), listConditions: vi.fn() } }));
vi.mock("@/services/care-reminders.service", () => ({ careRemindersService: { list: vi.fn() } }));

const DAY = 86_400_000;
const reminder = (id: string, title: string, inDays: number, state = "UPCOMING") => ({ id, petId: "p1", title, type: "CUSTOM", source: "USER_CREATED", sourceId: null, dueAt: new Date(Date.now() + inDays * DAY).toISOString(), originalDueAt: "", snoozedUntil: null, state, recurrence: "ONCE", intervalDays: null, completedAt: null, notifiedAt: null, cancelledAt: null, parentId: null });

describe("CareSheetView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(petsService.getById).mockResolvedValue({ id: "p1", name: "Cookie", species: "DOG", breed: "Terrier", birthDate: null, approximateAgeMonths: 30, latestWeightValue: 8, latestWeightUnit: "KG", microchipNumber: "123", photoUrl: null } as never);
    vi.mocked(petsService.getMyAccess).mockResolvedValue({ canViewCareProfile: true, canViewHealth: true } as never);
    vi.mocked(careProfileService.get).mockResolvedValue({ feedingRoutineText: "Twice a day, 120g", specialInstructionsText: "Never off-leash near the road", temperamentText: null } as never);
    vi.mocked(healthService.listAllergies).mockResolvedValue([
      { id: "a1", name: "Chicken", severity: "SEVERE", reaction: "Itching", status: "ACTIVE" },
      { id: "a2", name: "Old pollen", severity: null, reaction: null, status: "RESOLVED" },
    ] as never);
    vi.mocked(healthService.listMedications).mockResolvedValue([{ id: "m1", name: "Apoquel", dosage: 5.4, unit: "mg", frequencyText: "once daily", instructions: "with food", status: "ACTIVE" }] as never);
    vi.mocked(healthService.listConditions).mockResolvedValue([] as never);
    vi.mocked(careRemindersService.list).mockResolvedValue([reminder("r1", "Deworming tablet", 3), reminder("r2", "Next year's booster", 40), reminder("r3", "Done thing", 1, "COMPLETED")] as never);
  });

  it("puts routine, special instructions, active health and the next two weeks of care on one sheet", async () => {
    renderWithIntl(<CareSheetView petId="p1" />, "en");
    expect(await screen.findByText("Twice a day, 120g")).toBeTruthy();
    expect(screen.getByText("Never off-leash near the road")).toBeTruthy();
    expect(screen.getAllByText("Not recorded").length).toBeGreaterThan(0);
    const allergies = screen.getByText("Active allergies").parentElement!;
    expect(within(allergies).getByText("Chicken")).toBeTruthy();
    expect(within(allergies).queryByText("Old pollen")).toBeNull();
    expect(screen.getByText(/5.4 mg · once daily · with food/)).toBeTruthy();
    expect(within(screen.getByText("Active conditions").parentElement!).getByText("None recorded.")).toBeTruthy();
    expect(screen.getByText("Deworming tablet")).toBeTruthy();
    expect(screen.queryByText("Next year's booster")).toBeNull();
    expect(screen.queryByText("Done thing")).toBeNull();
    expect(screen.getByRole("button", { name: "Print / save as PDF" })).toBeTruthy();
  });

  it("never asks for health data the viewer can't see, and says so instead of printing it", async () => {
    vi.mocked(petsService.getMyAccess).mockResolvedValue({ canViewCareProfile: true, canViewHealth: false } as never);
    renderWithIntl(<CareSheetView petId="p1" />, "en");
    expect(await screen.findByText("Twice a day, 120g")).toBeTruthy();
    expect(screen.getByText("You don't have access to this section; it is left off the sheet.")).toBeTruthy();
    expect(healthService.listAllergies).not.toHaveBeenCalled();
    expect(screen.queryByText("Chicken")).toBeNull();
  });

  it("still prints the rest when one section fails to load", async () => {
    vi.mocked(careRemindersService.list).mockRejectedValue(new Error("plan required"));
    renderWithIntl(<CareSheetView petId="p1" />, "en");
    expect(await screen.findByText("This section didn't load; it is left off the sheet.")).toBeTruthy();
    expect(screen.getByText("Chicken")).toBeTruthy();
  });

  it("is Persian in Persian", async () => {
    renderWithIntl(<CareSheetView petId="p1" />, "fa");
    expect(await screen.findByRole("button", { name: "چاپ / ذخیره PDF" })).toBeTruthy();
    expect(screen.getByText("آلرژی‌های فعال")).toBeTruthy();
  });
});
