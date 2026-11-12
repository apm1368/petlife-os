import type { AdminPetTaxiDriverDto, AdminPetTaxiOverviewDto, MapPlaceDto, PetTaxiCarrierSizeValue, PetTaxiDriversDto, PetTaxiDriverStateDto, PetTaxiPointDto, PetTaxiQuoteDto, PetTaxiRideDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export const petTaxiService = {
  quote: (input: { pickup: PetTaxiPointDto; dropoff: PetTaxiPointDto; carrierSize: PetTaxiCarrierSizeValue; petCount: number }) =>
    apiFetch<PetTaxiQuoteDto>("/pet-taxi/quote", { method: "POST", body: input }),
  request: (input: { pickup: PetTaxiPointDto; dropoff: PetTaxiPointDto; carrierSize: PetTaxiCarrierSizeValue; petIds: string[] }, idempotencyKey: string) =>
    apiFetch<PetTaxiRideDto>("/pet-taxi/rides", { method: "POST", body: input, idempotencyKey }),
  rides: () => apiFetch<PetTaxiRideDto[]>("/pet-taxi/rides"),
  ride: (id: string) => apiFetch<PetTaxiRideDto>(`/pet-taxi/rides/${id}`),
  cancel: (id: string, reason?: string) => apiFetch<PetTaxiRideDto>(`/pet-taxi/rides/${id}/cancel`, { method: "POST", body: { reason } }),
  rate: (id: string, rating: number, comment?: string) => apiFetch<PetTaxiRideDto>(`/pet-taxi/rides/${id}/rate`, { method: "POST", body: { rating, comment } }),
  search: (q: string, near?: { latitude: number; longitude: number }) =>
    apiFetch<MapPlaceDto[]>(`/maps/search?${new URLSearchParams({ q, ...(near ? { lat: String(near.latitude), lng: String(near.longitude) } : {}) })}`),

  // Driver (provider panel)
  driverState: () => apiFetch<PetTaxiDriverStateDto>("/provider/pet-taxi"),
  presence: (input: { online: boolean; latitude?: number; longitude?: number }) => apiFetch<PetTaxiDriverStateDto>("/provider/pet-taxi/presence", { method: "POST", body: input }),
  accept: (id: string) => apiFetch<PetTaxiDriverStateDto>(`/provider/pet-taxi/rides/${id}/accept`, { method: "POST" }),
  decline: (id: string) => apiFetch<PetTaxiDriverStateDto>(`/provider/pet-taxi/rides/${id}/decline`, { method: "POST" }),
  advance: (id: string, status: "ARRIVING" | "PICKED_UP" | "COMPLETED") => apiFetch<PetTaxiDriverStateDto>(`/provider/pet-taxi/rides/${id}/status`, { method: "POST", body: { status } }),
  release: (id: string, reason: string) => apiFetch<PetTaxiDriverStateDto>(`/provider/pet-taxi/rides/${id}/release`, { method: "POST", body: { reason } }),
  drivers: () => apiFetch<PetTaxiDriversDto>("/provider/pet-taxi/drivers"),
  registerDriver: (input: { providerUserId: string; licenceNumber: string; vehiclePlate: string; vehicleDescription: string }) => apiFetch<PetTaxiDriversDto>("/provider/pet-taxi/drivers", { method: "POST", body: input }),

  // Admin
  adminOverview: () => apiFetch<AdminPetTaxiOverviewDto>("/admin/pet-taxi"),
  adminDrivers: () => apiFetch<AdminPetTaxiDriverDto[]>("/admin/pet-taxi/drivers"),
  adminDecideDriver: (id: string, status: "VERIFIED" | "SUSPENDED", reason: string) => apiFetch<AdminPetTaxiDriverDto[]>(`/admin/pet-taxi/drivers/${id}/decision`, { method: "POST", body: { status, reason } }),
  adminSaveRule: (city: string, rule: Record<string, unknown>) => apiFetch<AdminPetTaxiOverviewDto>(`/admin/pet-taxi/fare-rules/${encodeURIComponent(city)}`, { method: "PUT", body: rule }),
};
