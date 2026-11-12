import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { PetTaxiDriverStateDto, PetTaxiRideDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { petTaxiService } from "@/services/pet-taxi.service";
import { householdsService } from "@/services/households.service";
import { addressesService } from "@/services/addresses.service";
import { apiFetch } from "@/lib/api/client";
import { PetTaxiView } from "./PetTaxiView";
import { DriverConsoleView } from "./DriverConsoleView";

vi.mock("@/lib/api/client", async (orig) => ({ ...(await orig<typeof import("@/lib/api/client")>()), apiFetch: vi.fn() }));
vi.mock("@/services/pet-taxi.service", () => ({ petTaxiService: { rides: vi.fn(), quote: vi.fn(), request: vi.fn(), ride: vi.fn(), cancel: vi.fn(), rate: vi.fn(), search: vi.fn(), driverState: vi.fn(), presence: vi.fn(), accept: vi.fn(), decline: vi.fn(), advance: vi.fn(), release: vi.fn() } }));
vi.mock("@/services/households.service", () => ({ householdsService: { listMine: vi.fn(), listPets: vi.fn() } }));
vi.mock("@/services/addresses.service", () => ({ addressesService: { list: vi.fn() } }));

class RO {
  observe() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;

const ride: PetTaxiRideDto = {
  id: "r1", status: "DRIVER_ASSIGNED", carrierSize: "MEDIUM", petIds: ["p1"],
  pickup: { label: "Tajrish", latitude: 35.8, longitude: 51.43, city: "Tehran", note: null }, dropoff: { label: "Azadi", latitude: 35.7, longitude: 51.34 },
  fareIrr: 2_020_000, breakdown: { baseIrr: 500_000, distanceIrr: 800_000, timeIrr: 300_000, carrierIrr: 220_000, extraPetsIrr: 200_000, minimumApplied: false, km: 10, minutes: 30 },
  distanceMeters: 10_000, durationSeconds: 1_800, routeSource: "STRAIGHT_LINE_ESTIMATE", searchExpiresAt: "2026-11-12T12:10:00.000Z",
  driver: { name: "Reza", organizationName: "Paw Cabs", phone: "02188888888", latitude: 35.79, longitude: 51.42, locatedAt: "2026-11-12T12:02:00.000Z" }, member: null,
  etaSeconds: 300, assignedAt: "2026-11-12T12:01:00.000Z", arrivingAt: null, pickedUpAt: null, completedAt: null, cancelledAt: null, cancelReason: null, rating: null, ratingComment: null, createdAt: "2026-11-12T12:00:00.000Z",
};

describe("PetTaxiView", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue({ provider: "none", tileUrl: "https://tile.example/{z}/{x}/{y}.png", tileAttribution: "© OSM", googleBrowserKey: null, search: false, estimatesOnly: true });
    vi.mocked(householdsService.listMine).mockReset().mockResolvedValue([{ id: "h1" }] as never);
    vi.mocked(householdsService.listPets).mockReset().mockResolvedValue([{ id: "p1", name: "Cookie" }] as never);
    vi.mocked(addressesService.list).mockReset().mockResolvedValue([]);
  });

  it("follows an open ride: driver, ETA, call button and live map", async () => {
    vi.mocked(petTaxiService.rides).mockResolvedValue([ride]);
    renderWithIntl(<PetTaxiView />, "en");
    expect(await screen.findByRole("heading", { name: "Driver on the way" })).toBeTruthy();
    expect(screen.getByText("Reza")).toBeTruthy();
    expect(screen.getByText("About 5 min away")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Call" }).getAttribute("href")).toBe("tel:02188888888");
    expect(await screen.findByRole("application", { name: "Map" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel ride" })).toBeTruthy();
  });

  it("asks for a pickup first, and shows the receipt of a finished ride", async () => {
    vi.mocked(petTaxiService.rides).mockResolvedValue([{ ...ride, status: "COMPLETED", rating: null }]);
    renderWithIntl(<PetTaxiView />, "fa");
    expect(await screen.findByRole("heading", { name: "مبدأ را روی نقشه بزنید" })).toBeTruthy();
    expect(screen.getByText("رسید سفر")).toBeTruthy();
    expect(screen.getByRole("button", { name: "ثبت امتیاز" })).toBeTruthy();
  });
});

describe("DriverConsoleView", () => {
  const base: PetTaxiDriverStateDto = { eligible: true, reason: null, online: true, organizationName: "Paw Cabs", activeRide: null, requests: [] };
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue({ provider: "none", tileUrl: "https://tile.example/{z}/{x}/{y}.png", tileAttribution: "© OSM", googleBrowserKey: null, search: false, estimatesOnly: true });
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { watchPosition: vi.fn(() => 1), clearWatch: vi.fn(), getCurrentPosition: vi.fn() } });
  });

  it("lists nearby requests and accepts one", async () => {
    vi.mocked(petTaxiService.driverState).mockResolvedValue({ ...base, requests: [{ id: "r1", pickup: ride.pickup, dropoff: ride.dropoff, carrierSize: "SMALL", petCount: 1, fareIrr: 1_500_000, distanceMeters: 10_000, durationSeconds: 1_800, kmFromYou: 2.4, searchExpiresAt: ride.searchExpiresAt }] });
    vi.mocked(petTaxiService.accept).mockResolvedValue({ ...base, activeRide: { ...ride, driver: null, member: { name: "Sara", phone: "09120000000" } } });
    renderWithIntl(<DriverConsoleView />, "en");
    expect(await screen.findByText("2.4 km to pickup")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(petTaxiService.accept).toHaveBeenCalledWith("r1"));
    expect(await screen.findByText("Sara")).toBeTruthy();
    expect(screen.getByRole("button", { name: "I've arrived" })).toBeTruthy();
    expect(screen.getByText("Navigate: Neshan").getAttribute("href")).toContain("nshn.ir");
  });

  it("tells a clinic it is not a pet-taxi provider", async () => {
    vi.mocked(petTaxiService.driverState).mockResolvedValue({ ...base, eligible: false, reason: "NOT_PET_TAXI", online: false });
    renderWithIntl(<DriverConsoleView />, "de");
    expect(await screen.findByText("Nur für Tiertaxi-Anbieter.")).toBeTruthy();
  });
});
