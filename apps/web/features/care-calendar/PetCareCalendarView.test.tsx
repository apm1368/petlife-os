import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { careRemindersService } from "@/services/care-reminders.service";
import { careCalendarService } from "@/services/care-calendar.service";
import { PetCareCalendarView } from "./PetCareCalendarView";

vi.mock("@/services/care-reminders.service", () => ({ careRemindersService: { list: vi.fn() } }));
vi.mock("@/services/care-calendar.service", () => ({ careCalendarService: { list: vi.fn() } }));

describe("PetCareCalendarView localization", () => {
  beforeEach(() => {
    vi.mocked(careRemindersService.list).mockReset().mockResolvedValue([]);
    vi.mocked(careCalendarService.list).mockReset().mockResolvedValue([]);
  });

  it.each([["de", "Pflegekalender", "Kalenderansicht", "Monat"], ["es", "Calendario de cuidados", "Vista del calendario", "Mes"]] as const)("renders calendar controls in %s", async (locale, title, viewLabel, monthLabel) => {
    renderWithIntl(<PetCareCalendarView petId="pet-1" />, locale);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByRole("group", { name: viewLabel })).toBeTruthy();
    expect(screen.getByRole("button", { name: monthLabel })).toBeTruthy();
  });

  it("preserves Jalali Persian calendar labels and empty state", async () => {
    renderWithIntl(<PetCareCalendarView petId="pet-1" />, "fa");
    expect(await screen.findByRole("heading", { name: "تقویم مراقبت" })).toBeTruthy();
    expect(screen.getByText("رویدادی در این بازه ثبت نشده")).toBeTruthy();
  });
});
