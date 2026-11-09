import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { BookingDto, PetDto } from "@petlife/types";
import { PetLifecycleStatus, PetSpecies } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { ApiError } from "@/lib/api/client";
import { bookingsService } from "@/services/bookings.service";
import { petsService } from "@/services/pets.service";
import { BookingDetailView } from "./BookingDetailView";

const searchParamsMock = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => searchParamsMock,
}));
vi.mock("@/services/bookings.service", () => ({ bookingsService: { getById: vi.fn(), cancel: vi.fn(), recur: vi.fn(), pay: vi.fn(), review: vi.fn(), reschedule: vi.fn(), cancelFollowing: vi.fn() } }));
vi.mock("@/services/services.service", () => ({ servicesService: { getAvailability: vi.fn() } }));
vi.mock("@/services/pets.service", () => ({ petsService: { getById: vi.fn() } }));

const PET: PetDto = {
  id: "pet-1",
  householdId: "household-1",
  name: "Luna",
  species: PetSpecies.DOG,
  breed: null,
  sex: null,
  birthDate: null,
  approximateAgeMonths: 24,
  photoUrl: null,
  latestWeightValue: null,
  latestWeightUnit: null,
  colorMarkings: null,
  neuteredStatus: null,
  microchipNumber: null,
  lifecycleStatus: PetLifecycleStatus.ACTIVE,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const BASE_BOOKING: BookingDto = {
  id: "booking-1",
  householdId: "household-1",
  petId: "pet-1",
  userId: "user-1",
  providerOrganizationId: "provider-1",
  providerLocationId: "loc-1",
  providerUserId: "provider-user-1",
  providerServiceId: "svc-1",
  category: "VET" as never,
  locationMode: "AT_PROVIDER" as never,
  startAt: "2026-09-10T05:30:00.000Z",
  endAt: "2026-09-10T06:00:00.000Z",
  timezone: "Asia/Tehran",
  bookingStatus: "CONFIRMED" as never,
  paymentStatus: "NOT_REQUIRED" as never,
  reasonForVisit: "Annual checkup",
  ownerNotes: null,
  cancelledAt: null,
  cancelledReason: null,
  completedAt: null,
  completedByProviderUserId: null,
  completionNote: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  provider: {
    id: "provider-1",
    name: "Tehran Pet Care Clinic",
    type: "VET_CLINIC" as never,
    verificationStatus: "VERIFIED" as never,
    description: null,
    logoUrl: null,
    locations: [],
    services: [],
    nextAvailableSlotStart: null,
  },
  location: {
    id: "loc-1",
    providerOrganizationId: "provider-1",
    name: null,
    addressLine: "12 Vanak St.",
    city: "Tehran",
    region: null,
    countryCode: "IR",
    latitude: null,
    longitude: null,
    phone: null,
    timezone: "Asia/Tehran",
  },
  service: {
    id: "svc-1",
    providerOrganizationId: "provider-1",
    locationId: "loc-1",
    name: "General Vet Visit",
    description: null,
    type: "GENERAL_VET_VISIT" as never,
    category: "VET" as never,
    durationMinutes: 30,
    priceAmount: null,
    currency: null,
    supportsDog: true,
    supportsCat: true,
    minAgeMonths: null,
    maxAgeMonths: null,
    minWeightKg: null,
    maxWeightKg: null,
    requiresCareProfile: false,
    requiresHealthBasics: false,
    locationMode: "AT_PROVIDER" as never,
    isActive: true, bookingMode: "INSTANT" as never, paymentMode: "PAY_AT_PROVIDER" as never, depositAmount: null, cancellationPolicy: null, freeCancellationHours: 24, lateCancellationRefundPercent: 0, preparationNotes: null, maxPetsPerBooking: 1, requiredResourceType: null, variants: [],
  },
  customerAddress: null,
  dropoffAddress: null,
  bookingSeriesId: null,
  petAccess: { scopePreset: "HEALTH_BASICS" as never, expiresAt: "2026-09-11T06:00:00.000Z" },
  bookingNumber: "PL-B-000001", variantId: null, variantName: null, serviceName: null, bookingMode: "INSTANT" as never, paymentMode: "PAY_AT_PROVIDER" as never, priceAmount: null, discountAmount: 0, depositAmount: null, currency: null, durationMinutes: null, cancellationPolicy: null, freeCancellationHours: null, lateCancellationRefundPercent: null, preparation: null, requestExpiresAt: null, rejectedReason: null, rescheduledFromBookingId: null, rescheduledToBookingId: null, additionalPetIds: [], timeline: [], review: null,
};

describe("BookingDetailView", () => {
  const future = new Date(Date.now() + 5 * 86400_000).toISOString();
  const futureEnd = new Date(Date.now() + 5 * 86400_000 + 1800_000).toISOString();

  beforeEach(() => {
    vi.mocked(bookingsService.getById).mockReset();
    vi.mocked(bookingsService.cancel).mockReset();
    vi.mocked(petsService.getById).mockResolvedValue(PET);
    searchParamsMock.delete("created");
  });

  it("shows number, status, frozen terms, timeline and health share for a confirmed booking", async () => {
    vi.mocked(bookingsService.getById).mockResolvedValue({
      ...BASE_BOOKING,
      startAt: future,
      endAt: futureEnd,
      priceAmount: 10_000_000,
      currency: "IRR",
      cancellationPolicy: "لغو رایگان تا ۲۴ ساعت قبل",
      preparation: "۸ ساعت ناشتا",
      timeline: [{ id: "e1", fromStatus: null, toStatus: "CONFIRMED" as never, actorType: "USER", reason: null, createdAt: "2026-09-01T00:00:00.000Z" }],
    });
    renderWithIntl(<BookingDetailView bookingId="booking-1" />, "fa");
    expect((await screen.findAllByText("قطعی")).length).toBeGreaterThan(0);
    expect(screen.getByText("PL-B-000001")).toBeTruthy();
    expect(screen.getByText("لغو رایگان تا ۲۴ ساعت قبل")).toBeTruthy();
    expect(screen.getByText("۸ ساعت ناشتا")).toBeTruthy();
    expect(screen.getByText(/خلاصه سلامت/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "تغییر زمان" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "لغو نوبت" })).toBeTruthy();
  });

  it("previews the policy refund before a paid late cancellation and calls the real cancel endpoint", async () => {
    const soon = new Date(Date.now() + 2 * 3600_000).toISOString();
    vi.mocked(bookingsService.getById).mockResolvedValue({ ...BASE_BOOKING, startAt: soon, endAt: soon, paymentMode: "FULL_PREPAYMENT" as never, paymentStatus: "PAID" as never, priceAmount: 1_000_000, freeCancellationHours: 24, lateCancellationRefundPercent: 50 });
    vi.mocked(bookingsService.cancel).mockResolvedValue(BASE_BOOKING);
    renderWithIntl(<BookingDetailView bookingId="booking-1" />, "fa");
    fireEvent.click(await screen.findByRole("button", { name: "لغو نوبت" }));
    expect(await screen.findByText(/طبق قوانین، ۵۰٪ یعنی/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "بله، لغو شود" }));
    await waitFor(() => expect(bookingsService.cancel).toHaveBeenCalledWith("booking-1", undefined));
  });

  it("offers payment only while awaiting payment and never marks it paid itself", async () => {
    vi.mocked(bookingsService.getById).mockResolvedValue({ ...BASE_BOOKING, bookingStatus: "AWAITING_PAYMENT" as never, paymentStatus: "PENDING" as never, paymentMode: "DEPOSIT" as never, depositAmount: 2_000_000, priceAmount: 10_000_000, requestExpiresAt: future });
    vi.mocked(bookingsService.pay).mockResolvedValue(BASE_BOOKING);
    renderWithIntl(<BookingDetailView bookingId="booking-1" />, "fa");
    fireEvent.click(await screen.findByRole("button", { name: "پرداخت امن" }));
    await waitFor(() => expect(bookingsService.pay).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "تغییر زمان" })).toBeNull();
  });

  it("explains a declined request and offers rebooking, not cancellation", async () => {
    vi.mocked(bookingsService.getById).mockResolvedValue({ ...BASE_BOOKING, bookingStatus: "REJECTED" as never, rejectedReason: "تعطیلی کلینیک" });
    renderWithIntl(<BookingDetailView bookingId="booking-1" />, "fa");
    expect(await screen.findByText(/تعطیلی کلینیک/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "رزرو دوباره" }).getAttribute("href")).toContain("/providers/provider-1/book?serviceId=svc-1");
    expect(screen.queryByRole("button", { name: "لغو نوبت" })).toBeNull();
  });

  it("shows a forbidden state instead of an endless skeleton", async () => {
    vi.mocked(bookingsService.getById).mockRejectedValue(new ApiError({ code: "PET_ACCESS_DENIED", message: "x", requestId: "r" }, 403));
    renderWithIntl(<BookingDetailView bookingId="booking-1" />, "en");
    expect(await screen.findByText("You do not have access to this booking")).toBeTruthy();
  });

  it("keeps the loading state visible until the booking response arrives", () => {
    vi.mocked(bookingsService.getById).mockReturnValue(new Promise(() => {}));
    renderWithIntl(<BookingDetailView bookingId="booking-1" />, "en");
    expect(screen.getByLabelText("Loading booking…")).toBeTruthy();
  });

  it("shows not-found state for a missing booking", async () => {
    vi.mocked(bookingsService.getById).mockRejectedValue(new ApiError({ code: "BOOKING_NOT_FOUND", message: "x", requestId: "r" }, 404));
    renderWithIntl(<BookingDetailView bookingId="booking-1" />, "en");
    expect(await screen.findByText("Booking not found")).toBeTruthy();
  });

  it("offers retry after a booking load error", async () => {
    vi.mocked(bookingsService.getById)
      .mockRejectedValueOnce(new ApiError({ code: "TEMPORARY_FAILURE", message: "x", requestId: "r" }, 503))
      .mockResolvedValueOnce(BASE_BOOKING);
    renderWithIntl(<BookingDetailView bookingId="booking-1" />, "en");

    expect(await screen.findByText("Booking could not load")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("General Vet Visit")).toBeTruthy();
  });

  it("lets a completed booking be reviewed once", async () => {
    vi.mocked(bookingsService.getById).mockResolvedValue({ ...BASE_BOOKING, bookingStatus: "COMPLETED" as never, review: null });
    renderWithIntl(<BookingDetailView bookingId="booking-1" />, "en");
    expect(await screen.findByRole("button", { name: "Leave a review" })).toBeTruthy();
  });

  it("localizes German booking details and cancellation while preserving the German support route", async () => {
    vi.mocked(bookingsService.getById).mockResolvedValue({ ...BASE_BOOKING, startAt: future, endAt: futureEnd, paymentMode: "FULL_PREPAYMENT" as never });
    renderWithIntl(<BookingDetailView bookingId="booking-1" />, "de");

    expect(await screen.findByText("Bestätigt")).toBeTruthy();
    expect(screen.getByText("Haustier")).toBeTruthy();
    expect(screen.queryByText("قطعی")).toBeNull();
    expect(screen.queryByText("در حال بارگیری")).toBeNull();
    expect(screen.getByText("General Vet Visit")).toBeTruthy(); // source content is not machine-translated
    expect(screen.getByRole("link", { name: "Support kontaktieren" }).getAttribute("href")).toBe("/de/support/new?relatedEntityType=BOOKING&relatedEntityId=booking-1&category=BOOKING");
    fireEvent.click(screen.getByRole("button", { name: "Buchung stornieren" }));
    expect(screen.getByText("Diese Buchung stornieren?")).toBeTruthy();
    expect(screen.getByText("Der Anbieter hält diesen Termin dann nicht mehr für dich frei.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ja, Buchung stornieren" })).toBeTruthy();
  });

  it("localizes Spanish awaiting-payment state and keeps the actual pay action", async () => {
    vi.mocked(bookingsService.getById).mockResolvedValue({ ...BASE_BOOKING, bookingStatus: "AWAITING_PAYMENT" as never, paymentStatus: "PENDING" as never, paymentMode: "DEPOSIT" as never, depositAmount: 2_000_000, priceAmount: 10_000_000, requestExpiresAt: future });
    vi.mocked(bookingsService.pay).mockResolvedValue(BASE_BOOKING);
    renderWithIntl(<BookingDetailView bookingId="booking-1" />, "es");

    expect(await screen.findByText("Pendiente de pago")).toBeTruthy();
    expect(screen.getByText("Proveedor")).toBeTruthy();
    expect(screen.queryByText("در انتظار پرداخت")).toBeNull();
    expect(screen.getByRole("button", { name: "Pagar de forma segura" })).toBeTruthy();
    expect(screen.getByText(/La reserva solo se confirma cuando la pasarela confirma el pago/)).toBeTruthy();
  });

  it("shows a localized API error in German after a booking action fails", async () => {
    vi.mocked(bookingsService.getById).mockResolvedValue({ ...BASE_BOOKING, startAt: future, endAt: futureEnd });
    vi.mocked(bookingsService.cancel).mockRejectedValue(new ApiError({ code: "BOOKING_CONFLICT", message: "raw backend message", requestId: "r" }, 409));
    renderWithIntl(<BookingDetailView bookingId="booking-1" />, "de");

    fireEvent.click(await screen.findByRole("button", { name: "Buchung stornieren" }));
    fireEvent.click(screen.getByRole("button", { name: "Ja, Buchung stornieren" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Dieser Termin wurde gerade vergeben. Bitte wähle einen anderen.");
    expect(screen.queryByText("raw backend message")).toBeNull();
    expect(screen.queryByText(/این زمان همین حالا/)).toBeNull();
  });
});
