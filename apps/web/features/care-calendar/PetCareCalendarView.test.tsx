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
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06ff]/);
  });

  it.each([
    ["fa", "تقویم مراقبت", "رویدادی در این بازه ثبت نشده"],
    ["en", "Care calendar", "No events in this period"],
    ["de", "Pflegekalender", "Keine Ereignisse in diesem Zeitraum"],
    ["es", "Calendario de cuidados", "No hay eventos en este periodo"],
  ] as const)("renders the empty state in %s", async (locale, title, empty) => {
    renderWithIntl(<PetCareCalendarView petId="pet-1" />, locale);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByText(empty)).toBeTruthy();
  });

  it.each([
    ["fa", "در حال بارگذاری"],
    ["en", "Loading"],
    ["de", "Wird geladen"],
    ["es", "Cargando"],
  ] as const)("renders the loading state in %s", (locale, loading) => {
    vi.mocked(careRemindersService.list).mockReturnValue(new Promise(() => {}));
    vi.mocked(careCalendarService.list).mockReturnValue(new Promise(() => {}));
    renderWithIntl(<PetCareCalendarView petId="pet-1" />, locale);
    expect(screen.getByLabelText(loading)).toBeTruthy();
  });

  it.each([
    ["fa", "مشکلی پیش آمد", "تلاش دوباره"],
    ["en", "Something went wrong", "Try again"],
    ["de", "Ein Fehler ist aufgetreten", "Erneut versuchen"],
    ["es", "Ha ocurrido un problema", "Reintentar"],
  ] as const)("renders the retryable error state in %s", async (locale, title, retry) => {
    vi.mocked(careRemindersService.list).mockRejectedValue(new Error("private backend detail"));
    renderWithIntl(<PetCareCalendarView petId="pet-1" />, locale);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByRole("button", { name: retry })).toBeTruthy();
    expect(screen.queryByText("private backend detail")).toBeNull();
  });
});
