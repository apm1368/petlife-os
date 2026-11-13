import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import type { ProviderBookingDetailDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { providerOsService } from "@/services/provider-os.service";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { ProviderBookingDetailView } from "./ProviderBookingDetailView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/health-advanced.service", () => ({ healthAdvancedService: { downloadDocument: vi.fn() } }));
vi.mock("@/services/provider-os.service", () => ({
  providerOsService: {
    getBooking: vi.fn(),
    confirmBooking: vi.fn(),
    cancelBooking: vi.fn(),
    checkIn: vi.fn(),
    start: vi.fn(),
    complete: vi.fn(),
    addNote: vi.fn(),
  },
}));

function baseDetail(overrides: Partial<ProviderBookingDetailDto> = {}): ProviderBookingDetailDto {
  return {
    booking: {
      id: "booking-1",
      petId: "pet-1",
      petName: "Rex",
      petSpecies: "DOG" as never,
      ownerDisplayName: "Sarah",
      category: "GROOMING" as never,
      serviceName: "Full Groom",
      startAt: "2026-09-01T09:00:00.000Z",
      endAt: "2026-09-01T10:00:00.000Z",
      timezone: "UTC",
      locationLabel: "Test Location",
      bookingStatus: "CONFIRMED" as never,
      paymentStatus: "NOT_REQUIRED" as never,
      providerUserId: "pu-1",
      bookingNumber: "PL-B-000001", variantName: null, requestExpiresAt: null, resourceId: null, paymentMode: "PAY_AT_PROVIDER" as never,
      reasonForVisit: null,
      ownerNotes: null,
      cancelledAt: null,
      cancelledReason: null,
      completedAt: null,
      completedByProviderUserId: null,
      completionNote: null,
      createdAt: "2026-08-25T00:00:00.000Z",
      updatedAt: "2026-08-25T00:00:00.000Z",
    },
    pet: { id: "pet-1", name: "Rex", species: "DOG" as never, breed: null, photoUrl: null, identity: null },
    access: { state: "NO_GRANT", scopePreset: null, reason: null, startsAt: null, expiresAt: null, canViewCareProfile: false, canViewHealth: false },
    careProfile: null,
    healthSummary: null,
    healthDetails: null,
    intake: null,
    providerNotes: [],
    ...overrides,
  };
}

describe("ProviderBookingDetailView", () => {
  beforeEach(() => {
    vi.mocked(providerOsService.getBooking).mockReset();
    vi.mocked(providerOsService.confirmBooking).mockReset();
    vi.mocked(providerOsService.cancelBooking).mockReset();
    vi.mocked(providerOsService.checkIn).mockReset();
    vi.mocked(providerOsService.start).mockReset();
  });

  it("shows a clear NO_GRANT state and never renders Care/Health context", async () => {
    vi.mocked(providerOsService.getBooking).mockResolvedValue(baseDetail());

    renderWithIntl(<ProviderBookingDetailView bookingId="booking-1" />);

    await waitFor(() => expect(screen.getByText("No access")).toBeTruthy());
    expect(screen.queryByText("Care context")).toBeNull();
    expect(screen.queryByText("Health context")).toBeNull();
  });

  it("shows Care context but not Health context when the grant excludes health", async () => {
    vi.mocked(providerOsService.getBooking).mockResolvedValue(
      baseDetail({
        access: { state: "GRANTED", scopePreset: "GROOMING_BASIC" as never, reason: "GROOMING_BOOKING", startsAt: "2026-08-25T00:00:00.000Z", expiresAt: "2026-09-02T00:00:00.000Z", canViewCareProfile: true, canViewHealth: false },
        careProfile: { petId: "pet-1", temperamentText: "Friendly", aroundPeopleText: null, aroundAnimalsText: null, leashBehaviorText: null, handlingSensitivityText: null, feedingRoutineText: null, toiletRoutineText: null, separationBehaviorText: null, specialInstructionsText: null, status: "PARTIAL" as never, createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z" },
      }),
    );

    renderWithIntl(<ProviderBookingDetailView bookingId="booking-1" />);

    await waitFor(() => expect(screen.getByText("Access granted")).toBeTruthy());
    expect(screen.getByText("Care context")).toBeTruthy();
    expect(screen.getByText("Friendly")).toBeTruthy();
    expect(screen.queryByText("Health context")).toBeNull();
  });

  it("confirms a CONFIRMED booking idempotently and shows a success message", async () => {
    const detail = baseDetail();
    vi.mocked(providerOsService.getBooking).mockResolvedValue(detail);
    vi.mocked(providerOsService.confirmBooking).mockResolvedValue(detail);

    renderWithIntl(<ProviderBookingDetailView bookingId="booking-1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(providerOsService.confirmBooking).toHaveBeenCalledWith("booking-1"));
    await waitFor(() => expect(screen.getAllByText("Confirmed").length).toBeGreaterThan(1));
  });

  it("walks CONFIRMED -> CHECKED_IN -> IN_PROGRESS as the provider clicks through", async () => {
    const detail = baseDetail();
    vi.mocked(providerOsService.getBooking).mockResolvedValue(detail);
    vi.mocked(providerOsService.checkIn).mockResolvedValue(baseDetail({ booking: { ...detail.booking, bookingStatus: "CHECKED_IN" as never } }));
    vi.mocked(providerOsService.start).mockResolvedValue(baseDetail({ booking: { ...detail.booking, bookingStatus: "IN_PROGRESS" as never } }));

    renderWithIntl(<ProviderBookingDetailView bookingId="booking-1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Check in" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Check in" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Start" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Complete" })).toBeTruthy());
  });

  it("opens the cancel dialog and calls cancelBooking with the entered reason", async () => {
    const detail = baseDetail();
    vi.mocked(providerOsService.getBooking).mockResolvedValue(detail);
    vi.mocked(providerOsService.cancelBooking).mockResolvedValue(baseDetail({ booking: { ...detail.booking, bookingStatus: "CANCELLED_BY_PROVIDER" as never } }));

    renderWithIntl(<ProviderBookingDetailView bookingId="booking-1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel booking" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
    await waitFor(() => expect(screen.getByText("Cancel this booking?")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: "Staff unavailable" } });
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel booking" }));

    await waitFor(() => expect(providerOsService.cancelBooking).toHaveBeenCalledWith("booking-1", "Staff unavailable"));
  });

  it.each([
    ["de", "Buchung", "Zugriff auf Haustierdaten", "Kein Zugriff", "Ja, Buchung stornieren"],
    ["es", "Reserva", "Acceso a los datos de la mascota", "Sin acceso", "Sí, cancelar la reserva"],
  ] as const)("renders the full booking detail and cancel dialog in %s without translating source notes", async (locale, title, accessTitle, noAccess, confirmCancel) => {
    const detail = baseDetail({ booking: { ...baseDetail().booking, reasonForVisit: "Owner-authored visit reason" } });
    vi.mocked(providerOsService.getBooking).mockResolvedValue(detail);
    vi.mocked(providerOsService.cancelBooking).mockResolvedValue(detail);
    const view = renderWithIntl(<ProviderBookingDetailView bookingId="booking-1" />, locale);

    await waitFor(() => expect(screen.getByRole("heading", { name: title })).toBeTruthy());
    expect(screen.getByText(accessTitle)).toBeTruthy();
    expect(screen.getByText(noAccess)).toBeTruthy();
    expect(screen.getByText("Owner-authored visit reason")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: locale === "de" ? "Buchung stornieren" : "Cancelar reserva" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("button", { name: confirmCancel })).toBeTruthy();
    expect(view.container.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it("uses the translated generic action error rather than exposing raw API text", async () => {
    vi.mocked(providerOsService.getBooking).mockResolvedValue(baseDetail());
    vi.mocked(providerOsService.cancelBooking).mockRejectedValue(new Error("raw backend English error"));
    renderWithIntl(<ProviderBookingDetailView bookingId="booking-1" />, "es");
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancelar reserva" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Cancelar reserva" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar la reserva" }));
    await waitFor(() => expect(screen.getByText("No se pudo completar la acción. Inténtalo de nuevo.")).toBeTruthy());
  });

  describe("the pet's records the owner allowed", () => {
    const identity = { sex: "FEMALE" as never, birthDate: null, approximateAgeMonths: 30, latestWeightValue: 12.5, latestWeightUnit: "KG" as never, hasMicrochip: true };
    const vetBooking = (over: Partial<ProviderBookingDetailDto["booking"]> = {}) => ({ ...baseDetail().booking, category: "VET" as never, serviceName: "Checkup", ...over });

    it("before the booking is assigned to the viewer it shows the pet's name and kind, and says the rest follows assignment", async () => {
      vi.mocked(providerOsService.getBooking).mockResolvedValue(baseDetail({ booking: vetBooking(), pet: { ...baseDetail().pet, breed: "Beagle" } }));
      renderWithIntl(<ProviderBookingDetailView bookingId="booking-1" />);
      await waitFor(() => expect(screen.getByRole("heading", { name: "Rex" })).toBeTruthy());
      expect(screen.getByText("Dog · Beagle")).toBeTruthy();
      expect(screen.getByText("Sex, age, weight and microchip are shown to the team member this booking is assigned to.")).toBeTruthy();
      expect(screen.queryByText("Microchipped")).toBeNull();
      expect(screen.queryByRole("button", { name: "Open Clinical Record" })).toBeNull();
    });

    it("with basic identity only: general info, the owner's notes and intake answers, but no health and no clinical record", async () => {
      vi.mocked(providerOsService.getBooking).mockResolvedValue(
        baseDetail({
          booking: vetBooking({ reasonForVisit: "Itchy paws", ownerNotes: "Nervous in the car" }),
          pet: { ...baseDetail().pet, identity },
          access: { state: "GRANTED", scopePreset: "MINIMAL_VET_CONTEXT" as never, reason: "VET_BOOKING", startsAt: "2026-08-25T00:00:00.000Z", expiresAt: "2026-09-02T10:00:00.000Z", canViewCareProfile: false, canViewHealth: false },
          intake: { formVersion: 1, answers: [{ key: "fasted", label: "Fasted since last night?", type: "BOOLEAN", value: true }, { key: "symptoms", label: "Symptoms", type: "MULTI_SELECT", value: ["Scratching", "Licking"] }] },
        }),
      );
      renderWithIntl(<ProviderBookingDetailView bookingId="booking-1" />);
      await waitFor(() => expect(screen.getByText("Access granted")).toBeTruthy());
      expect(screen.getByText("Female")).toBeTruthy();
      expect(screen.getByText("2y 6m")).toBeTruthy();
      expect(screen.getByText("12.5 kg")).toBeTruthy();
      expect(screen.getByText("Microchipped")).toBeTruthy();
      expect(screen.getByText("Nervous in the car")).toBeTruthy();
      expect(screen.getByText("Owner's intake answers")).toBeTruthy();
      expect(screen.getByText("Yes")).toBeTruthy();
      expect(screen.getByText("Scratching, Licking")).toBeTruthy();
      expect(screen.getByText("The owner shared basic identity only for this booking, so no health information or clinical record is available.")).toBeTruthy();
      expect(screen.queryByText("Health context")).toBeNull();
      expect(screen.queryByRole("button", { name: "Open Clinical Record" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Start clinical visit" })).toBeNull();
    });

    it("with health shared: allergies, conditions, medications, vaccination dates and the owner's documents, with a secure download", async () => {
      const open = vi.spyOn(window, "open").mockReturnValue(null);
      vi.mocked(healthAdvancedService.downloadDocument).mockResolvedValue({ downloadUrl: "https://files.example/signed", expiresInSeconds: 300 });
      vi.mocked(providerOsService.getBooking).mockResolvedValue(
        baseDetail({
          booking: vetBooking(),
          pet: { ...baseDetail().pet, identity },
          access: { state: "GRANTED", scopePreset: "HEALTH_BASICS" as never, reason: "VET_BOOKING_HEALTH_CONSENT", startsAt: "2026-08-25T00:00:00.000Z", expiresAt: "2026-09-02T10:00:00.000Z", canViewCareProfile: true, canViewHealth: true },
          healthSummary: { status: "PARTIAL" as never, allergyState: "KNOWN_PRESENT" as never, conditionsState: "KNOWN_NEGATIVE" as never, activeMedicationCount: 1, medicationsState: "KNOWN_PRESENT" as never, vaccinationStatus: "UP_TO_DATE" as never, nextVaccinationDueAt: "2027-05-01T00:00:00.000Z", primaryAttention: null },
          healthDetails: {
            allergies: [{ id: "a1", name: "Chicken", severity: "SEVERE", reaction: "Hives" }],
            conditions: [],
            medications: [{ id: "m1", name: "Apoquel", dosage: 16, unit: "mg", frequencyText: "daily" }],
            vaccination: { status: "UP_TO_DATE" as never, lastKnownDate: "2026-05-01T00:00:00.000Z", nextDueDate: "2027-05-01T00:00:00.000Z", notes: null },
            sharedDocuments: [{ id: "doc-1", petId: "pet-1", householdId: "hh-1", documentType: "LAB_REPORT" as never, title: "Blood panel", description: null, sourceType: "OWNER" as never, source: { providerOrganizationId: null, providerOrganizationName: null, providerUserId: null, providerUserDisplayTitle: null, userId: "u1" }, recordedAt: "2026-04-01T00:00:00.000Z", uploadedAt: "2026-04-02T00:00:00.000Z", mimeType: "application/pdf", fileSizeBytes: 100, visibility: "HOUSEHOLD_ONLY" as never, verificationStatus: "UNVERIFIED" as never, relatedVisitId: null, relatedLabResultId: null, relatedImagingStudyId: null, relatedReferralId: null, voidedAt: null, voidedReason: null, createdAt: "2026-04-02T00:00:00.000Z", updatedAt: "2026-04-02T00:00:00.000Z" }],
          },
        }),
      );
      renderWithIntl(<ProviderBookingDetailView bookingId="booking-1" />);
      await waitFor(() => expect(screen.getByText("Health context")).toBeTruthy());
      expect(screen.getByText("Chicken · Severe · Hives")).toBeTruthy();
      expect(screen.getByText("None known")).toBeTruthy();
      expect(screen.getByText("Apoquel · 16 mg · daily")).toBeTruthy();
      expect(screen.getByText("Up to date")).toBeTruthy();
      expect(screen.getByText("Next vaccination due")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Open Clinical Record" })).toBeTruthy();
      expect(screen.getByText("Documents the owner shared for this visit")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Secure download" }));
      await waitFor(() => expect(healthAdvancedService.downloadDocument).toHaveBeenCalledWith("pet-1", "doc-1"));
      await waitFor(() => expect(open).toHaveBeenCalledWith("https://files.example/signed", "_blank", "noopener,noreferrer"));
      open.mockRestore();
    });

    it("renders the new pet and health labels in Persian", async () => {
      vi.mocked(providerOsService.getBooking).mockResolvedValue(
        baseDetail({ booking: vetBooking(), pet: { ...baseDetail().pet, identity }, access: { state: "GRANTED", scopePreset: "MINIMAL_VET_CONTEXT" as never, reason: "VET_BOOKING", startsAt: null, expiresAt: null, canViewCareProfile: false, canViewHealth: false } }),
      );
      renderWithIntl(<ProviderBookingDetailView bookingId="booking-1" />, "fa");
      await waitFor(() => expect(screen.getByText("ماده")).toBeTruthy());
      expect(screen.getByText("میکروچیپ")).toBeTruthy();
      expect(screen.getByText("صاحب حیوان برای این نوبت فقط مشخصات پایه را به اشتراک گذاشته است؛ اطلاعات سلامت و پروندهٔ بالینی در دسترس نیست.")).toBeTruthy();
    });
  });
});
