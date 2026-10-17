import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { careRemindersService, type CareReminder } from "@/services/care-reminders.service";
import { petsService } from "@/services/pets.service";
import { CareCenterView } from "./CareCenterView";

vi.mock("@/services/care-reminders.service", () => ({ careRemindersService: { list: vi.fn(), get: vi.fn(), act: vi.fn() } }));
vi.mock("@/services/pets.service", () => ({ petsService: { getMyAccess: vi.fn(), getById: vi.fn() } }));
vi.mock("./CareProfileView", () => ({ CareProfileView: () => null }));

const DAY = 86_400_000;
const at = (d: number) => new Date(Date.now() + d * DAY).toISOString();
const item = (id: string, state: string, type: string, title: string, due: number, extra: Partial<CareReminder> = {}): CareReminder => ({ id, petId: "p1", title, type, source: "USER_CREATED", sourceId: null, dueAt: at(due), originalDueAt: at(due), snoozedUntil: null, state, recurrence: "ONCE", intervalDays: null, completedAt: null, notifiedAt: null, cancelledAt: null, parentId: null, ...extra });

describe("CareCenterView — agenda", () => {
  beforeEach(() => {
    vi.mocked(careRemindersService.list).mockResolvedValue([
      item("u", "UPCOMING", "VACCINATION", "Rabies booster", 21),
      item("o", "OVERDUE", "DEWORMING", "Deworming tablet", -3),
      item("c", "COMPLETED", "WEIGHT_CHECK", "Monthly weigh-in", -35, { completedAt: at(-35) }),
      item("x", "CANCELLED", "GROOMING", "Pre-holiday groom", -50),
      item("s", "SNOOZED", "MEDICATION_REFILL", "Refill Apoquel", 4, { snoozedUntil: at(6) }),
    ]);
    vi.mocked(petsService.getMyAccess).mockResolvedValue({ canEditCareProfile: true } as never);
    vi.mocked(petsService.getById).mockResolvedValue({ name: "Cookie" } as never);
  });

  it("opens on everything that matters, overdue first, never on an empty tab", async () => {
    renderWithIntl(<CareCenterView petId="p1" />, "en");
    const headings = (await screen.findAllByRole("heading", { level: 2 })).map((h) => h.textContent);
    expect(headings[0]).toMatch(/^Overdue/);
    expect(headings.join("|")).toMatch(/Snoozed.*Upcoming.*Recently completed/);
    expect(screen.queryByText("Pre-holiday groom")).toBeNull(); // cancelled only through its filter
    fireEvent.click(screen.getByRole("button", { name: /^Cancelled/ }));
    expect(screen.getByText("Pre-holiday groom")).toBeTruthy();
  });

  it("shows when a snoozed item will remind and links provider care to booking", async () => {
    renderWithIntl(<CareCenterView petId="p1" />, "en");
    const snoozed = (await screen.findByText("Refill Apoquel")).closest("li")!;
    expect(within(snoozed).getByText(/^Reminds /)).toBeTruthy();
    const vaccine = screen.getByText("Rabies booster").closest("li")!;
    expect(within(vaccine).getByRole("link", { name: "Book a visit" }).getAttribute("href")).toBe("/en/vet/find");
  });

  it("is fully Persian in Persian, with Persian counts", async () => {
    renderWithIntl(<CareCenterView petId="p1" />, "fa");
    const filters = await screen.findByRole("navigation", { name: "فیلتر مراقبت" });
    expect(filters.textContent).not.toMatch(/[A-Za-z0-9]/);
  });
});
