import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { petsService } from "@/services/pets.service";
import { careRemindersService } from "@/services/care-reminders.service";
import type { PetOverviewDto } from "@petlife/types";
import { PetProfileView } from "./PetProfileView";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
const profile = (petId: string) => <NextIntlClientProvider locale="en" messages={en}><PetProfileView petId={petId} /></NextIntlClientProvider>;

vi.mock("next/navigation", () => ({ usePathname: () => "/en/pets/one", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/services/pets.service", () => ({ petsService: { getOverview: vi.fn(), getMyAccess: vi.fn() } }));
vi.mock("@/services/care-reminders.service", () => ({ careRemindersService: { list: vi.fn() } }));
const overview = (id: string) => ({ pet: { id, lifecycleStatus: "ACTIVE" }, householdName: `Family ${id}`, attention: [], upcoming: [], recentHealth: [], recentActivity: [], recentMemory: null }) as unknown as PetOverviewDto;
const access = { canViewHealth: true, canViewCareProfile: true, canEditIdentity: false, canEditHealth: false };

describe("pet overview reads", () => {
  beforeEach(() => {
    vi.mocked(petsService.getOverview).mockReset().mockImplementation(async (id) => overview(id));
    vi.mocked(petsService.getMyAccess).mockReset().mockResolvedValue(access as never);
    vi.mocked(careRemindersService.list).mockReset().mockResolvedValue([]);
  });

  it("reports care failure instead of showing reassuring empty states, while retaining available history", async () => {
    vi.mocked(careRemindersService.list).mockRejectedValue(new Error("offline"));
    renderWithIntl(<PetProfileView petId="one" />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("No actionable item was found in the recorded data.")).toBeNull();
    expect(screen.queryByText("No future dated event has been recorded.")).toBeNull();
    expect(screen.getByRole("heading", { name: "Recent health" })).toBeTruthy();
  });

  it.each([["de", "Erfordert Aufmerksamkeit", "Anstehend", "Gesundheitsakte öffnen"], ["es", "Requiere atención", "Próximos", "Abrir historial de salud"]] as const)("renders the pet overview in %s", async (locale, attention, upcoming, healthShortcut) => {
    renderWithIntl(<PetProfileView petId="one" />, locale);
    expect(await screen.findByRole("heading", { name: attention })).toBeTruthy();
    expect(screen.getByRole("heading", { name: upcoming })).toBeTruthy();
    expect(screen.getByRole("link", { name: healthShortcut })).toBeTruthy();
  });

  it.each([
    ["fa", "بر اساس داده‌های ثبت‌شده، مورد اقدام‌پذیری پیدا نشد.", "رویداد زمان‌داری برای آینده ثبت نشده است.", "هنوز رویداد سلامت قابل نمایش ثبت نشده است.", "هنوز فعالیتی برای این حیوان ثبت نشده است.", "هنوز خاطره‌ای ثبت نشده است."],
    ["en", "No actionable item was found in the recorded data.", "No future dated event has been recorded.", "No health event is available yet.", "No activity has been recorded for this pet yet.", "No memory has been recorded yet."],
    ["de", "In den gespeicherten Angaben wurde kein konkreter Handlungsbedarf gefunden.", "Es wurde kein zukünftiges Ereignis mit Datum erfasst.", "Es sind noch keine Gesundheitsereignisse verfügbar.", "Für dieses Haustier wurden noch keine Aktivitäten erfasst.", "Es wurde noch keine Erinnerung erfasst."],
    ["es", "No se encontraron acciones pendientes en los datos registrados.", "No hay eventos futuros con fecha registrada.", "Todavía no hay eventos de salud disponibles.", "Todavía no se ha registrado actividad para esta mascota.", "Todavía no se ha registrado ningún recuerdo."],
  ] as const)("renders all pet-overview empty states in %s", async (locale, noAttention, noUpcoming, noHealth, noActivity, noMemory) => {
    const { container } = renderWithIntl(<PetProfileView petId="one" />, locale);
    await screen.findByRole("heading", { name: locale === "fa" ? "نیازمند توجه" : locale === "en" ? "Needs attention" : locale === "de" ? "Erfordert Aufmerksamkeit" : "Requiere atención" });
    expect(container.textContent).toContain(noAttention);
    expect(container.textContent).toContain(noUpcoming);
    expect(container.textContent).toContain(noHealth);
    expect(container.textContent).toContain(noActivity);
    expect(container.textContent).toContain(noMemory);
    if (locale !== "fa") expect(container.textContent).not.toMatch(/[آ-ی]/);
  });

  it.each([
    ["fa", "در حال آماده‌سازی نمای کلی", "نمای کلی پرونده بارگذاری نشد.", "تلاش دوباره"],
    ["en", "Preparing pet overview", "The pet overview could not be loaded.", "Try again"],
    ["de", "Haustierübersicht wird vorbereitet", "Die Aktenübersicht konnte nicht geladen werden.", "Erneut versuchen"],
    ["es", "Preparando el resumen de la mascota", "No se pudo cargar el resumen del historial.", "Intentar de nuevo"],
  ] as const)("localizes loading and fatal read failure in %s", async (locale, loading, loadError, retry) => {
    vi.mocked(petsService.getOverview).mockImplementation(() => new Promise(() => {}));
    const { unmount } = renderWithIntl(<PetProfileView petId="one" />, locale);
    expect(screen.getByLabelText(loading)).toBeTruthy();
    unmount();

    vi.mocked(petsService.getOverview).mockRejectedValue(new Error("offline"));
    renderWithIntl(<PetProfileView petId="one" />, locale);
    expect(await screen.findByText(loadError)).toBeTruthy();
    expect(screen.getByRole("button", { name: retry })).toBeTruthy();
  });

  it.each([
    ["fa", "یادآورهای مراقبت بارگذاری نشدند.", "فهرست مراقبت‌های نیازمند توجه و پیش‌رو هنوز کامل دریافت نشده است."],
    ["en", "Care reminders could not be loaded.", "Care items needing attention and upcoming care have not been fully retrieved."],
    ["de", "Pflegeerinnerungen konnten nicht geladen werden.", "Pflegepunkte mit Handlungsbedarf und anstehende Pflege wurden noch nicht vollständig geladen."],
    ["es", "No se pudieron cargar los recordatorios de cuidados.", "Todavía no se han recuperado todos los cuidados que requieren atención y los próximos cuidados."],
  ] as const)("localizes the partial-care warning in %s without claiming an empty list", async (locale, unavailable, incomplete) => {
    vi.mocked(careRemindersService.list).mockRejectedValue(new Error("offline"));
    const { container } = renderWithIntl(<PetProfileView petId="one" />, locale);
    expect(await screen.findByText(new RegExp(unavailable))).toBeTruthy();
    expect(container.textContent).toContain(incomplete);
    if (locale !== "fa") expect(container.textContent).not.toMatch(/[آ-ی]/);
  });

  it("retries reads and restores a real overdue care item after recovery", async () => {
    vi.mocked(careRemindersService.list).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([{ id: "care1", title: "Follow up", type: "CUSTOM", state: "OVERDUE", dueAt: "2026-10-01T10:00:00Z" }] as never);
    renderWithIntl(<PetProfileView petId="one" />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Follow up")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(careRemindersService.list).toHaveBeenCalledTimes(2);
  });

  it("does not request care or expose its shortcut without read permission", async () => {
    vi.mocked(petsService.getMyAccess).mockResolvedValue({ ...access, canViewCareProfile: false } as never);
    renderWithIntl(<PetProfileView petId="one" />);
    await screen.findByText("Household: Family one");
    expect(careRemindersService.list).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "Care center" })).toBeNull();
  });

  it("hides the previous pet immediately while the next record is pending", async () => {
    const view = renderWithIntl(<PetProfileView petId="one" />);
    await screen.findByText("Household: Family one");
    vi.mocked(petsService.getOverview).mockImplementationOnce(() => new Promise(() => {}));
    view.rerender(profile("two"));
    expect(screen.queryByText("Household: Family one")).toBeNull();
    expect(screen.queryByRole("link", { name: "Open health record" })).toBeNull();
  });

  it("ignores a late old overview and permission response after changing pets", async () => {
    let resolveOld!: (value: PetOverviewDto) => void;
    vi.mocked(petsService.getOverview).mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    const view = renderWithIntl(<PetProfileView petId="one" />);
    view.rerender(profile("two"));
    await screen.findByText("Household: Family two");
    await act(async () => { resolveOld(overview("one")); });
    expect(screen.queryByText("Household: Family one")).toBeNull();
    expect(careRemindersService.list).not.toHaveBeenCalledWith("one");
    expect(screen.getByRole("link", { name: "Open health record" }).getAttribute("href")).toBe("/en/pets/two/health");
  });

  it("ignores a late old care response after the next pet has loaded", async () => {
    let resolveOld!: (value: never[]) => void;
    vi.mocked(careRemindersService.list).mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    const view = renderWithIntl(<PetProfileView petId="one" />);
    await waitFor(() => expect(careRemindersService.list).toHaveBeenCalledWith("one"));
    view.rerender(profile("two"));
    await screen.findByText("Household: Family two");
    await act(async () => { resolveOld([{ id: "old-care", title: "Other pet care", type: "CUSTOM", state: "OVERDUE", dueAt: "2026-10-01T10:00:00Z" }] as never); });
    expect(screen.queryByText("Other pet care")).toBeNull();
    expect(screen.getByText("Household: Family two")).toBeTruthy();
  });
});
