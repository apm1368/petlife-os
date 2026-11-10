import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ApiError } from "@/lib/api/client";
import { servicesService } from "@/services/services.service";
import { LegacyServiceBookingRedirect } from "./LegacyServiceBookingRedirect";

const replace = vi.fn();
const router = { replace };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/services/services.service", () => ({ servicesService: { getDetail: vi.fn() } }));
const detail = { provider: { id: "qa-provider" } } as Awaited<ReturnType<typeof servicesService.getDetail>>;

describe("legacy service booking recovery", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it.each([
    ["fa", "این خدمت در دسترس نیست"],
    ["en", "This service is unavailable"],
    ["de", "Dieser Service ist nicht verfügbar"],
    ["es", "Este servicio no está disponible"],
  ] as const)("renders the actual 404 state in %s", async (locale, title) => {
    vi.mocked(servicesService.getDetail).mockRejectedValue(new ApiError({ code: "NOT_FOUND", message: "not found", requestId: "qa" }, 404));
    renderWithIntl(<LegacyServiceBookingRedirect serviceId="qa-service" />, locale);
    expect(await screen.findByText(title)).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    ["de", "Die Buchung konnte nicht geladen werden", "Erneut versuchen"],
    ["es", "No se pudo cargar la reserva", "Reintentar"],
  ] as const)("does not call a network failure missing, and retries in %s", async (locale, title, retry) => {
    vi.mocked(servicesService.getDetail).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(detail);
    renderWithIntl(<LegacyServiceBookingRedirect serviceId="qa-service" />, locale);
    expect(await screen.findByText(title)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: retry }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/${locale}/providers/qa-provider/book?serviceId=qa-service`));
    expect(servicesService.getDetail).toHaveBeenCalledTimes(2);
  });

  it("does not navigate after leaving the page while the lookup is pending", async () => {
    let finish!: (value: typeof detail) => void;
    vi.mocked(servicesService.getDetail).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = renderWithIntl(<LegacyServiceBookingRedirect serviceId="qa-service" />, "en");
    view.unmount();
    await act(async () => finish(detail));
    expect(replace).not.toHaveBeenCalled();
  });
});
