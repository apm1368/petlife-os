import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { careRemindersService, type CareReminder } from "@/services/care-reminders.service";
import { petsService } from "@/services/pets.service";
import { CareCenterView } from "./CareCenterView";
import { ApiError } from "@/lib/api/client";

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
    vi.mocked(careRemindersService.get).mockImplementation(async (_petId, itemId) => item(itemId, "UPCOMING", "VACCINATION", "Rabies booster", 21));
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

  it.each([
    ["fa", "مرکز مراقبت", "یادآور جدید"],
    ["en", "Care center", "Create reminder"],
    ["de", "Pflegebereich", "Erinnerung erstellen"],
    ["es", "Centro de cuidados", "Crear recordatorio"],
  ] as const)("localizes the full agenda body in %s and preserves authored reminder titles", async (locale, title, create) => {
    renderWithIntl(<CareCenterView petId="p1" />, locale);
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeTruthy();
    expect(screen.getByRole("button", { name: create })).toBeTruthy();
    expect(await screen.findByText("Rabies booster")).toBeTruthy(); // user-entered title is preserved
    if (locale === "de" || locale === "es") {
      expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
      expect(document.body.textContent).not.toContain("Create reminder");
      expect(document.body.textContent).not.toContain("فیلتر مراقبت");
    }
  });

  it.each([
    ["de", /Tag/, "Titel der Erinnerung", "Wiederholung auswählen", "Speichern"],
    ["es", /Día/, "Título del recordatorio", "Elige la repetición", "Guardar"],
  ] as const)("localizes reminder creation fields and validation in %s", async (locale, dayLabel, titleLabel, recurrenceLabel, saveLabel) => {
    renderWithIntl(<CareCenterView petId="p1" />, locale);
    fireEvent.click(await screen.findByRole("button", { name: locale === "de" ? "Erinnerung erstellen" : "Crear recordatorio" }));
    expect(screen.getByLabelText(titleLabel)).toBeTruthy();
    expect(screen.getByRole("button", { name: dayLabel })).toBeTruthy();
    expect(screen.getByLabelText(recurrenceLabel)).toBeTruthy();
    expect(screen.getByRole("button", { name: saveLabel })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(titleLabel), { target: { value: "Annual check-up" } });
    fireEvent.click(screen.getByRole("button", { name: saveLabel }));
    expect((await screen.findByRole("alert")).textContent).toContain(locale === "de" ? "Wähle einen Tag und eine Uhrzeit aus." : "Elige un día y una hora.");
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([
    ["de", "Absagen", "Absage bestätigen", "Diese Erinnerung wird abgesagt."],
    ["es", "Cancelar", "Confirmar cancelación", "Se cancelará este recordatorio"],
  ] as const)("localizes the destructive confirmation flow in %s", async (locale, cancel, confirmName, warning) => {
    renderWithIntl(<CareCenterView petId="p1" itemId="u" />, locale);
    fireEvent.click(await screen.findByRole("button", { name: cancel }));
    expect(screen.getByRole("group", { name: confirmName }).textContent).toContain(warning);
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([
    ["de", "Noch keine Pflegeeinträge", "Pflegeerinnerungen werden geladen"],
    ["es", "Aún no hay cuidados registrados", "Cargando recordatorios de cuidados"],
  ] as const)("localizes empty and loading states in %s", async (locale, emptyTitle, loadingLabel) => {
    vi.mocked(careRemindersService.list).mockResolvedValueOnce([]);
    renderWithIntl(<CareCenterView petId="p1" />, locale);
    expect(await screen.findByText(emptyTitle)).toBeTruthy();

    vi.mocked(careRemindersService.list).mockReturnValueOnce(new Promise(() => {}));
    cleanup();
    renderWithIntl(<CareCenterView petId="p1" />, locale);
    expect(screen.getByRole("status", { name: loadingLabel })).toBeTruthy();
  });

  it.each([["de", "Sie haben keinen Zugriff"], ["es", "No tienes acceso"]] as const)("localizes access-denied state in %s", async (locale, accessText) => {
    vi.mocked(careRemindersService.list).mockRejectedValueOnce(new ApiError({ code: "FORBIDDEN", message: "forbidden", details: {}, requestId: "test" }, 403));
    renderWithIntl(<CareCenterView petId="p1" />, locale);
    expect(await screen.findByText(accessText)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });
});
