import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ProviderTeamMemberDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { providerOsService } from "@/services/provider-os.service";
import { ProviderTeamView } from "./ProviderTeamView";

vi.mock("@/services/provider-os.service", () => ({ providerOsService: { listTeam: vi.fn(), listStaff: vi.fn(), listServices: vi.fn(), updateStaff: vi.fn(), setStaffServices: vi.fn() } }));

describe("ProviderTeamView", () => {
  beforeEach(() => {
    vi.mocked(providerOsService.listTeam).mockReset();
    vi.mocked(providerOsService.listStaff).mockReset();
    vi.mocked(providerOsService.listServices).mockReset();
    vi.mocked(providerOsService.updateStaff).mockReset();
    vi.mocked(providerOsService.setStaffServices).mockReset();
    vi.mocked(providerOsService.listStaff).mockResolvedValue([{ providerUserId: "pu-1", displayName: "Dr. Sara Vet", role: "VET", displayTitle: "DVM", publicBio: "Original provider bio", isBookable: true, serviceIds: ["svc-1"] }]);
    vi.mocked(providerOsService.listServices).mockResolvedValue([{ id: "svc-1", providerOrganizationId: "org-1", locationId: null, name: "Original service name", description: null, type: "VET_APPOINTMENT" as never, category: "VETERINARY" as never, durationMinutes: 30, priceAmount: null, currency: null, supportsDog: true, supportsCat: true, minAgeMonths: null, maxAgeMonths: null, minWeightKg: null, maxWeightKg: null, requiresCareProfile: false, requiresHealthBasics: false, locationMode: "ONLINE" as never, isActive: true, bookingMode: "REQUEST" as never, paymentMode: "NONE" as never, depositAmount: null, cancellationPolicy: null, freeCancellationHours: 24, lateCancellationRefundPercent: 0, preparationNotes: null, maxPetsPerBooking: 1, requiredResourceType: null, variants: [] }]);
  });

  it("lists team members with their role", async () => {
    const members: ProviderTeamMemberDto[] = [
      { providerUserId: "pu-1", displayName: "Dr. Sara Vet", role: "VET" as never, displayTitle: "DVM", status: "ACTIVE", createdAt: "2026-01-01T00:00:00.000Z" },
      { providerUserId: "pu-2", displayName: "Reception Staff", role: "STAFF" as never, displayTitle: "Front Desk", status: "ACTIVE", createdAt: "2026-01-01T00:00:00.000Z" },
    ];
    vi.mocked(providerOsService.listTeam).mockResolvedValue(members);

    renderWithIntl(<ProviderTeamView />);

    await waitFor(() => expect(screen.getByText("Dr. Sara Vet")).toBeTruthy());
    expect(screen.getByText("Reception Staff")).toBeTruthy();
    expect(screen.getByText("Vet")).toBeTruthy();
    expect(screen.getByText("Staff")).toBeTruthy();
  });

  it("shows an empty state with no members", async () => {
    vi.mocked(providerOsService.listTeam).mockResolvedValue([]);

    renderWithIntl(<ProviderTeamView />);

    await waitFor(() => expect(screen.getByText("No team members yet.")).toBeTruthy());
  });

  it.each(["de", "es"] as const)("renders the full team page in %s without Persian UI", async (locale) => {
    vi.mocked(providerOsService.listTeam).mockResolvedValue([
      { providerUserId: "pu-1", displayName: "Dr. Sara Vet", role: "VET" as never, displayTitle: "DVM", status: "ACTIVE", createdAt: "2026-01-01T00:00:00.000Z" },
    ]);

    const { container } = renderWithIntl(<ProviderTeamView />, locale);
    await waitFor(() => expect(screen.getByText("Dr. Sara Vet")).toBeTruthy());
    expect(screen.getByText(locale === "de" ? "Team" : "Equipo")).toBeTruthy();
    expect(await screen.findByText(locale === "de" ? "Angebotene Leistungen" : "Servicios que ofrece")).toBeTruthy();
    expect(await screen.findByLabelText(locale === "de" ? "Öffentliche Bezeichnung" : "Cargo público")).toBeTruthy();
    expect(screen.getByText("Original service name")).toBeTruthy();
    expect(screen.getByDisplayValue("Original provider bio")).toBeTruthy();
    expect(container.textContent).not.toMatch(/[\u0600-\u06ff]/);
  });

  it("translates owner-only save failures without exposing backend error text", async () => {
    vi.mocked(providerOsService.listTeam).mockResolvedValue([
      { providerUserId: "pu-1", displayName: "Dr. Sara Vet", role: "VET" as never, displayTitle: "DVM", status: "ACTIVE", createdAt: "2026-01-01T00:00:00.000Z" },
    ]);
    vi.mocked(providerOsService.updateStaff).mockRejectedValue(new Error("PROVIDER_ACCESS_DENIED"));

    renderWithIntl(<ProviderTeamView />, "es");
    const title = await screen.findByLabelText("Cargo público");
    fireEvent.change(title, { target: { value: "Dra." } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect((await screen.findByRole("alert")).textContent).toContain("No se pudo guardar el cambio.");
    expect(screen.getByRole("alert").textContent).not.toContain("PROVIDER_ACCESS_DENIED");
  });
});
