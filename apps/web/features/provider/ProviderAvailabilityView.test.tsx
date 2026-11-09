import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ApiError } from "@/lib/api/client";
import { formatAppointmentDateTime } from "@/lib/date/appointment-date";
import { providerOsService } from "@/services/provider-os.service";
import { ProviderAvailabilityView } from "./ProviderAvailabilityView";

vi.mock("@/services/provider-os.service", () => ({
  providerOsService: {
    listAvailabilityRules: vi.fn(),
    listAvailabilityExceptions: vi.fn(),
    createAvailabilityRule: vi.fn(),
    updateAvailabilityRule: vi.fn(),
    updateAvailabilityException: vi.fn(),
    deleteAvailabilityRule: vi.fn(),
    createAvailabilityException: vi.fn(),
    deleteAvailabilityException: vi.fn(),
  },
}));

describe("ProviderAvailabilityView", () => {
  beforeEach(() => {
    vi.mocked(providerOsService.listAvailabilityRules).mockReset().mockResolvedValue([]);
    vi.mocked(providerOsService.listAvailabilityExceptions).mockReset().mockResolvedValue([]);
    vi.mocked(providerOsService.createAvailabilityException).mockReset();
  });

  it("requires explicit acknowledgement before creating a conflicting BLOCKED exception, then proceeds without cancelling anything", async () => {
    vi.mocked(providerOsService.createAvailabilityException)
      .mockRejectedValueOnce(new ApiError({ code: "AVAILABILITY_CONFLICT", message: "conflict", requestId: "r1", details: { count: 3 } }, 409))
      .mockResolvedValueOnce({ id: "exc-1", providerOrganizationId: "org-1", locationId: "loc-1", providerUserId: null, startAt: "2026-09-05T09:00:00.000Z", endAt: "2026-09-05T10:00:00.000Z", type: "BLOCKED" as never, reason: "Closed" });

    renderWithIntl(<ProviderAvailabilityView />);
    await waitFor(() => expect(screen.getByText("Time off & extra availability")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Location ID"), { target: { value: "loc-1" } });
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-09-05T09:00" } });
    fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "2026-09-05T10:00" } });
    const addButtons = screen.getAllByRole("button", { name: "Add" });
    fireEvent.click(addButtons[addButtons.length - 1]!);

    await waitFor(() => expect(screen.getByText("3 confirmed bookings exist in this period. Blocking it will not cancel or move them.")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Block anyway" }));

    await waitFor(() => expect(providerOsService.createAvailabilityException).toHaveBeenLastCalledWith(expect.objectContaining({ acknowledgeConflict: true })));
  });

  it.each([
    ["de", "Verfügbarkeit", "Wöchentlicher Zeitplan", "Abwesenheit und zusätzliche Verfügbarkeit", "Es sind noch keine wiederkehrenden Zeiten eingerichtet."],
    ["es", "Disponibilidad", "Horario semanal", "Ausencias y disponibilidad adicional", "Aún no hay disponibilidad recurrente configurada."],
  ] as const)("renders the full availability page empty state in %s with no Persian UI", async (locale, title, rulesTitle, exceptionsTitle, emptyRules) => {
    vi.mocked(providerOsService.listAvailabilityRules).mockResolvedValue([]);
    vi.mocked(providerOsService.listAvailabilityExceptions).mockResolvedValue([]);
    const view = renderWithIntl(<ProviderAvailabilityView />, locale);
    await waitFor(() => expect(screen.getByRole("heading", { name: title })).toBeTruthy());
    expect(screen.getByText(rulesTitle)).toBeTruthy();
    expect(screen.getByText(exceptionsTitle)).toBeTruthy();
    expect(screen.getByText(emptyRules)).toBeTruthy();
    expect(view.container.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([
    ["de", "In diesem Zeitraum gibt es 2 bestätigte Buchungen. Eine Sperrung storniert oder verschiebt sie nicht.", "Trotzdem sperren"],
    ["es", "Hay 2 reservas confirmadas en este periodo. Bloquearlo no las cancelará ni las cambiará.", "Bloquear de todos modos"],
  ] as const)("localizes the conflict warning and explicit proceed action in %s", async (locale, warning, proceed) => {
    vi.mocked(providerOsService.createAvailabilityException)
      .mockRejectedValueOnce(new ApiError({ code: "AVAILABILITY_CONFLICT", message: "conflict", requestId: "r1", details: { count: 2 } }, 409))
      .mockResolvedValueOnce({} as never);
    renderWithIntl(<ProviderAvailabilityView />, locale);
    await waitFor(() => expect(screen.getByRole("heading", { name: locale === "de" ? "Verfügbarkeit" : "Disponibilidad" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText(locale === "de" ? "Standort-ID" : "ID de ubicación"), { target: { value: "loc-1" } });
    fireEvent.change(screen.getByLabelText(locale === "de" ? "Beginn" : "Inicio"), { target: { value: "2026-09-05T09:00" } });
    fireEvent.change(screen.getByLabelText(locale === "de" ? "Ende" : "Fin"), { target: { value: "2026-09-05T10:00" } });
    const addButtons = screen.getAllByRole("button", { name: locale === "de" ? "Hinzufügen" : "Añadir" });
    fireEvent.click(addButtons[addButtons.length - 1]!);
    await waitFor(() => expect(screen.getByText(warning)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: proceed }));
    await waitFor(() => expect(providerOsService.createAvailabilityException).toHaveBeenLastCalledWith(expect.objectContaining({ acknowledgeConflict: true })));
  });

  it.each([["de", "Du darfst die Verfügbarkeit nicht verwalten."], ["es", "No tienes permiso para gestionar la disponibilidad."]] as const)("distinguishes no-access from load failure in %s", async (locale, message) => {
    vi.mocked(providerOsService.listAvailabilityRules).mockRejectedValue(new ApiError({ code: "FORBIDDEN", message: "forbidden", requestId: "r1" }, 403));
    vi.mocked(providerOsService.listAvailabilityExceptions).mockResolvedValue([]);
    renderWithIntl(<ProviderAvailabilityView />, locale);
    await waitFor(() => expect(screen.getByText(message)).toBeTruthy());
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each(["de", "es"] as const)("formats exception dates with the selected %s locale", async (locale) => {
    const exception = { id: "ex-1", providerOrganizationId: "org-1", locationId: "loc-1", providerUserId: null, startAt: "2026-09-01T09:00:00.000Z", endAt: "2026-09-01T10:00:00.000Z", type: "BLOCKED" as never, reason: "Owner-authored closure reason" };
    vi.mocked(providerOsService.listAvailabilityRules).mockResolvedValue([]);
    vi.mocked(providerOsService.listAvailabilityExceptions).mockResolvedValue([exception] as never);
    const view = renderWithIntl(<ProviderAvailabilityView />, locale);
    const range = `${formatAppointmentDateTime(exception.startAt, locale, "UTC")} – ${formatAppointmentDateTime(exception.endAt, locale, "UTC")}`;
    await waitFor(() => expect(screen.getByText(range)).toBeTruthy());
    expect(screen.getByText("Owner-authored closure reason")).toBeTruthy();
    expect(view.container.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });
});

it("edits an existing rule without creating a duplicate", async () => {
 vi.mocked(providerOsService.listAvailabilityRules).mockResolvedValue([{id:"r1",locationId:"loc1",dayOfWeek:1,startLocalTime:"09:00",endLocalTime:"17:00",timezone:"Asia/Tehran"}] as never);
 vi.mocked(providerOsService.listAvailabilityExceptions).mockResolvedValue([]);
 vi.mocked(providerOsService.updateAvailabilityRule).mockResolvedValue({} as never);
 vi.mocked(providerOsService.createAvailabilityRule).mockClear();
 renderWithIntl(<ProviderAvailabilityView/>);
 fireEvent.click(await screen.findByRole("button",{name:"Edit"}));
 fireEvent.change(screen.getByLabelText("End time"),{target:{value:"18:00"}});
 fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
 await waitFor(()=>expect(providerOsService.updateAvailabilityRule).toHaveBeenCalledWith("r1",expect.objectContaining({endLocalTime:"18:00",timezone:"Asia/Tehran"})));
 expect(providerOsService.createAvailabilityRule).not.toHaveBeenCalled();
});
