import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { careRemindersService } from "@/services/care-reminders.service";
import { careCalendarService } from "@/services/care-calendar.service";
import { PetCareCalendarView } from "./PetCareCalendarView";

vi.mock("@/services/care-reminders.service", () => ({ careRemindersService: { list: vi.fn() } }));
vi.mock("@/services/care-calendar.service", () => ({ careCalendarService: { list: vi.fn() } }));

describe("PetCareCalendarView locale behavior", () => {
  beforeEach(() => {
    vi.mocked(careRemindersService.list).mockReset().mockResolvedValue([]);
    vi.mocked(careCalendarService.list).mockReset().mockResolvedValue([]);
  });

  it.each([
    ["de", "Pflegekalender", "Monat", "Agenda", "In diesem Zeitraum gibt es keine Termine."],
    ["es", "Calendario de cuidados", "Mes", "Agenda", "No hay eventos en este periodo."],
  ] as const)("uses localized calendar controls, empty state and date formatting for %s", async (locale, title, month, agenda, empty) => {
    renderWithIntl(<PetCareCalendarView petId="pet-1" />, locale);

    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeTruthy();
    expect(screen.getByRole("button", { name: month })).toBeTruthy();
    expect(screen.getByRole("button", { name: agenda })).toBeTruthy();
    expect(screen.getByText(empty)).toBeTruthy();

    const expectedMonth = new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date());
    expect(screen.getByRole("heading", { level: 2 }).textContent?.toLowerCase()).toContain(expectedMonth.toLowerCase());
  });
});
