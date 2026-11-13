import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { useAdminStore } from "@/stores/admin-store";
import { adminCalendarService, type CalendarYearDto } from "@/services/admin-calendar.service";
import { AdminHolidaysView } from "./AdminHolidaysView";
import { holidayNameKeys } from "./holiday-names";

vi.mock("@/services/admin-calendar.service", () => ({ adminCalendarService: { year: vi.fn(), change: vi.fn(), clear: vi.fn() } }));

const YEAR: CalendarYearDto = {
  year: 1405, from: "2026-03-21", to: "2027-03-20", coverage: "official", today: "2026-11-12",
  days: [
    { date: "2026-03-21", jalali: "1405-01-01", title: "جشن نوروز/جشن سال نو · عید سعید فطر", closed: true, official: { title: "جشن نوروز/جشن سال نو · عید سعید فطر", religious: true }, staff: null },
    { date: "2026-12-23", jalali: "1405-10-02", title: "ولادت امام علی (ع) و روز پدر", closed: true, official: { title: "ولادت امام علی (ع) و روز پدر", religious: true }, staff: null },
    { date: "2026-12-30", jalali: null, title: "Office closure", closed: true, official: null, staff: { closed: true, title: "Office closure", reason: "Moving office", updatedAt: "2026-11-12T10:00:00.000Z" } },
  ],
};

const signIn = (permissions: string[]) => useAdminStore.setState({ context: { isAdmin: true, adminUserId: "a1", displayName: "Root", role: "SUPER_ADMIN", permissions } as never, status: "ready" });

describe("Holidays and closures", () => {
  beforeEach(() => {
    vi.mocked(adminCalendarService.year).mockReset().mockResolvedValue(YEAR);
    vi.mocked(adminCalendarService.change).mockReset().mockResolvedValue(YEAR.days[1]!);
    vi.mocked(adminCalendarService.clear).mockReset().mockResolvedValue({ date: "2026-12-30", day: null });
  });

  it("names official holidays in English, marks team changes and lets settings managers open a holiday with a reason", async () => {
    signIn(["settings.view", "settings.manage"]);
    renderWithIntl(<AdminHolidaysView />);
    expect(await screen.findByText("Nowruz (Persian New Year) · Eid al-Fitr")).toBeTruthy();
    expect(screen.getByText("Birth of Imam Ali (Father's Day)")).toBeTruthy();
    const closureRow = screen.getByText("Office closure").closest("tr")!;
    expect(within(closureRow).getByText("Team closure")).toBeTruthy();
    expect(within(closureRow).getByText("Moving office")).toBeTruthy();
    // Past days can't be changed; upcoming official ones can be opened.
    expect(within(screen.getByText("Nowruz (Persian New Year) · Eid al-Fitr").closest("tr")!).queryByRole("button")).toBeNull();
    fireEvent.click(within(screen.getByText("Birth of Imam Ali (Father's Day)").closest("tr")!).getByRole("button", { name: "Open as a working day" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Open as a working day" }).at(-1)!);
    expect((await screen.findByRole("alert")).textContent).toContain("at least 5 characters");
    fireEvent.change(screen.getAllByLabelText("Reason").at(-1)!, { target: { value: "Team works this day" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Open as a working day" }).at(-1)!);
    await waitFor(() => expect(adminCalendarService.change).toHaveBeenCalledWith("2026-12-23", { closed: false, title: "ولادت امام علی (ع) و روز پدر", reason: "Team works this day" }));
    expect(await screen.findByText("The day is now a working day.")).toBeTruthy();
  });

  it("adds a closure only with a date, name and reason", async () => {
    signIn(["settings.view", "settings.manage"]);
    renderWithIntl(<AdminHolidaysView />);
    await screen.findByText("Office closure");
    fireEvent.click(screen.getByRole("button", { name: "Close this day" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Pick a date");
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-12-29" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Inventory day" } });
    fireEvent.change(screen.getAllByLabelText("Reason")[0]!, { target: { value: "Yearly stock count" } });
    fireEvent.click(screen.getByRole("button", { name: "Close this day" }));
    await waitFor(() => expect(adminCalendarService.change).toHaveBeenCalledWith("2026-12-29", { closed: true, title: "Inventory day", reason: "Yearly stock count" }));
  });

  it("is read-only without settings.manage, and Persian keeps the official wording", async () => {
    signIn(["settings.view"]);
    renderWithIntl(<AdminHolidaysView />, "fa");
    expect(await screen.findByText("ولادت امام علی (ع) و روز پدر")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "باز کردن به‌عنوان روز کاری" })).toBeNull();
    expect(screen.queryByRole("button", { name: "تعطیل کردن این روز" })).toBeNull();
  });

  it("maps every official name in the generated list", async () => {
    const { IRAN_OFFICIAL_HOLIDAYS } = await import("../../../api/src/common/time/iran-holidays.data");
    const unknown = IRAN_OFFICIAL_HOLIDAYS.flatMap((h) => holidayNameKeys(h.title)).filter((k) => typeof k !== "string");
    expect(unknown).toEqual([]);
  });
});
