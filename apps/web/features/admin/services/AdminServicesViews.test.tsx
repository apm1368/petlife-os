import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ApiError } from "@/lib/api/client";
import { adminServicesService } from "@/services/admin-services.service";
import {
  AdminProviderReviewsView,
  AdminProviderServicesView,
  AdminServiceBookingDetailView,
  AdminServiceBookingsView,
  AdminServicesAnalyticsView,
} from "./AdminServicesViews";

vi.mock("next/navigation", () => ({ usePathname: () => "/fa/admin/services", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/services/admin-services.service", () => ({
  adminServicesService: {
    listBookings: vi.fn(), getBooking: vi.fn(), listServices: vi.fn(), setServiceActive: vi.fn(),
    listReviews: vi.fn(), hideReview: vi.fn(), analytics: vi.fn(), waitlist: vi.fn(),
  },
}));

const booking = {
  id: "b1", bookingNumber: "PL-B-000009", status: "REQUESTED", paymentStatus: "NOT_REQUIRED", category: "VET",
  startAt: "2026-10-01T06:00:00.000Z", petName: "Milo", providerName: "Mehr Clinic", serviceName: "Consultation", priceAmount: 1_000_000, currency: "IRR",
};
const detail = {
  id: "b1", bookingNumber: "PL-B-000009", status: "CONFIRMED", paymentStatus: "PAID", paymentMode: "FULL_PREPAYMENT", bookingMode: "INSTANT", category: "VET",
  startAt: "2026-10-01T06:00:00.000Z", endAt: "2026-10-01T07:00:00.000Z", timezone: "Asia/Tehran", serviceName: "Consultation", variantName: null,
  priceAmount: 1_000_000, depositAmount: null, discountAmount: 0, currency: "IRR", cancellationPolicy: "Refund in accordance with policy", freeCancellationHours: 24, lateCancellationRefundPercent: 50,
  cancelledReason: null, rejectedReason: null, pet: { id: "p1", name: "Milo", species: "DOG" }, customer: { id: "u1", displayName: "Alex", email: "a@example.test", phone: null },
  provider: { id: "pr1", name: "Mehr Clinic", verificationStatus: "VERIFIED" }, location: { name: "Clinic", city: "Tehran" }, staff: null,
  healthAccess: { scopePreset: "HEALTH_BASICS", canViewHealth: true, canRecordClinicalData: false, expiresAt: null, revokedAt: null, reason: null },
  timeline: [{ fromStatus: "REQUESTED", toStatus: "CONFIRMED", actorType: "PROVIDER", reason: "تأیید توسط ارائه‌دهنده", createdAt: "2026-10-01T05:00:00.000Z" }],
  payment: { id: "pay1", amount: 1_000_000, currency: "IRR", status: "PAID", provider: "STANDARD_GATEWAY" }, refunds: [], supportCases: [],
  clinicalVisits: [{ id: "v1", status: "SCHEDULED" }], review: { id: "r1", rating: 5, status: "PUBLISHED" }, rescheduledTo: null, rescheduledFrom: null,
};
const service = { id: "s1", providerOrganizationId: "o1", providerName: "Mehr Clinic", name: "Consultation", category: "VET", type: "VISIT", isActive: true, bookingMode: "INSTANT", paymentMode: "FULL_PREPAYMENT", priceAmount: 1_000_000, variantCount: 1, bookingCount: 3 };
const review = { id: "r1", providerName: "Mehr Clinic", bookingNumber: "PL-B-000009", rating: 5, body: "درمان عالی بود", status: "PUBLISHED", hiddenReason: null, providerResponse: null, createdAt: "2026-10-01T05:00:00.000Z" };
const analytics = { periodDays: 30, totalBookings: 12, completed: 8, cancelled: 1, noShow: 1, requested: 1, rejected: 1, expired: 0, byStatus: {}, byCategory: { VET: 12 }, reviewAverage: 4.5, reviewCount: 4, waitlistActive: 2 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(adminServicesService.listBookings).mockResolvedValue({ total: 1, page: 1, items: [booking] });
  vi.mocked(adminServicesService.getBooking).mockResolvedValue(detail);
  vi.mocked(adminServicesService.listServices).mockResolvedValue([service]);
  vi.mocked(adminServicesService.setServiceActive).mockResolvedValue({ id: "s1", isActive: false });
  vi.mocked(adminServicesService.listReviews).mockResolvedValue([review]);
  vi.mocked(adminServicesService.hideReview).mockResolvedValue(undefined);
  vi.mocked(adminServicesService.analytics).mockResolvedValue(analytics);
  vi.mocked(adminServicesService.waitlist).mockResolvedValue([{ id: "w1", providerName: "Mehr Clinic", serviceName: "Consultation", windowStart: "2026-10-01T06:00:00.000Z", windowEnd: "2026-10-01T07:00:00.000Z", status: "OFFERED", createdAt: "2026-10-01T05:00:00.000Z" }]);
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

describe("admin services full-page localization", () => {
  it.each([
    ["fa", "خدمات و رزروها", "درخواست‌شده"],
    ["en", "Services & bookings", "Requested"],
    ["de", "Dienstleistungen und Buchungen", "Angefragt"],
    ["es", "Servicios y reservas", "Solicitada"],
  ] as const)("localizes booking page body in %s", async (locale, title, status) => {
    renderWithIntl(<AdminServiceBookingsView />, locale);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(await screen.findByText("PL-B-000009")).toBeTruthy();
    expect((await screen.findAllByText(status)).length).toBeGreaterThan(0);
    expect(screen.getByText(locale === "fa" ? "ارائه‌دهنده" : locale === "en" ? "Provider" : locale === "de" ? "Anbieter" : "Proveedor")).toBeTruthy();
    expect(screen.getByRole("button", { name: locale === "fa" ? "بعدی" : locale === "en" ? "Next" : locale === "de" ? "Weiter" : "Siguiente" })).toBeTruthy();
    if (locale === "de" || locale === "es") {
      expect(document.body.textContent).not.toContain("رزرو");
      expect(document.body.textContent).not.toContain("خدمات");
    }
  });

  it.each([
    ["fa", "رزرو", "تأییدشده"], ["en", "Booking", "Confirmed"], ["de", "Buchung", "Bestätigt"], ["es", "Reserva", "Confirmada"],
  ] as const)("localizes booking detail states and keeps authored content intact in %s", async (locale, heading, status) => {
    renderWithIntl(<AdminServiceBookingDetailView bookingId="b1" />, locale);
    expect(await screen.findByRole("heading", { name: "PL-B-000009" })).toBeTruthy();
    expect((await screen.findAllByText(status)).length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain("تأیید توسط ارائه‌دهنده");
    expect(screen.getByText(locale === "fa" ? heading : locale === "en" ? "Booking" : locale === "de" ? "Buchung" : "Reserva")).toBeTruthy();
    expect(document.body.textContent).toContain(locale === "fa" ? "دامپزشکی" : locale === "en" ? "Veterinary" : locale === "de" ? "Tiermedizin" : "Veterinaria");
  });

  it.each([
    ["fa", "خدمات ارائه‌دهندگان", "غیرفعال‌کردن خدمت"], ["en", "Provider services", "Deactivate service"], ["de", "Dienstleistungen der Anbieter", "Dienstleistung deaktivieren"], ["es", "Servicios de proveedores", "Desactivar servicio"],
  ] as const)("localizes service table and confirmation dialog in %s", async (locale, title, dialogTitle) => {
    renderWithIntl(<AdminProviderServicesView />, locale);
    expect(await screen.findByText(title)).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: locale === "fa" ? "غیرفعال‌کردن" : locale === "en" ? "Deactivate" : locale === "de" ? "Deaktivieren" : "Desactivar" }));
    expect(await screen.findByRole("dialog", { name: dialogTitle })).toBeTruthy();
    expect(screen.getByRole("button", { name: locale === "fa" ? "تأیید" : locale === "en" ? "Confirm" : locale === "de" ? "Bestätigen" : "Confirmar" })).toBeTruthy();
  });

  it.each([
    ["fa", "نظرهای ارائه‌دهندگان", "پنهان‌کردن نظر"], ["en", "Provider reviews", "Hide review"], ["de", "Anbieterbewertungen", "Bewertung ausblenden"], ["es", "Reseñas de proveedores", "Ocultar reseña"],
  ] as const)("localizes reviews and preserves user-authored review content in %s", async (locale, title, hideLabel) => {
    renderWithIntl(<AdminProviderReviewsView />, locale);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByText("درمان عالی بود")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: locale === "fa" ? "پنهان‌کردن" : locale === "en" ? "Hide" : locale === "de" ? "Ausblenden" : "Ocultar" }));
    expect(await screen.findByRole("dialog", { name: hideLabel })).toBeTruthy();
  });

  it.each([
    ["fa", "آمار خدمات (۳۰ روز)"], ["en", "Services analytics (30 days)"], ["de", "Dienstleistungsanalyse (30 Tage)"], ["es", "Análisis de servicios (30 días)"],
  ] as const)("localizes dashboard metrics, category labels and waitlist in %s", async (locale, title) => {
    renderWithIntl(<AdminServicesAnalyticsView />, locale);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect((await screen.findAllByText(locale === "fa" ? "تکمیل‌شده" : locale === "en" ? "Completed" : locale === "de" ? "Abgeschlossen" : "Completadas")).length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain(locale === "fa" ? "دامپزشکی" : locale === "en" ? "Veterinary" : locale === "de" ? "Tiermedizin" : "Veterinaria");
    expect(screen.getByText(locale === "fa" ? "پیشنهاد نوبت" : locale === "en" ? "Slot offered" : locale === "de" ? "Termin angeboten" : "Turno ofrecido")).toBeTruthy();
  });

  it("shows an explicit no-access state", async () => {
    vi.mocked(adminServicesService.getBooking).mockRejectedValue(new ApiError({ code: "ADMIN_PERMISSION_DENIED", message: "x", requestId: "r" }, 403));
    renderWithIntl(<AdminServiceBookingDetailView bookingId="b1" />, "es");
    expect(await screen.findByText("No tienes permiso para consultar esta reserva.")).toBeTruthy();
  });

  it("shows localized access-denied states for provider-service and analytics endpoints", async () => {
    vi.mocked(adminServicesService.listServices).mockRejectedValue(new ApiError({ code: "ADMIN_PERMISSION_DENIED", message: "x", requestId: "r" }, 403));
    renderWithIntl(<AdminProviderServicesView />, "de");
    expect(await screen.findByText("Sie dürfen die Dienstleistungen der Anbieter nicht ansehen.")).toBeTruthy();

    vi.mocked(adminServicesService.analytics).mockRejectedValue(new ApiError({ code: "ADMIN_PERMISSION_DENIED", message: "x", requestId: "r" }, 403));
    renderWithIntl(<AdminServicesAnalyticsView />, "es");
    expect(await screen.findByText("No tienes permiso para consultar el análisis de servicios.")).toBeTruthy();
  });

  it("distinguishes offline, server-error and genuinely empty states", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    vi.mocked(adminServicesService.listBookings).mockRejectedValue(new Error("network"));
    renderWithIntl(<AdminServiceBookingsView />, "de");
    expect(await screen.findByText("Sie sind offline. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.")).toBeTruthy();

    vi.mocked(adminServicesService.listReviews).mockResolvedValue([]);
    renderWithIntl(<AdminProviderReviewsView />, "es");
    expect(await screen.findByText("No hay reseñas")).toBeTruthy();

    vi.mocked(adminServicesService.listBookings).mockRejectedValue(new Error("server"));
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    renderWithIntl(<AdminServiceBookingsView />, "es");
    expect(await screen.findByText("No se pudieron cargar las reservas. Inténtalo de nuevo.")).toBeTruthy();
  });
});
