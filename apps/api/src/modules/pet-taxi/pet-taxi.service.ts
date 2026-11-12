import { Injectable } from "@nestjs/common";
import { PetTaxiCarrierSize, PetTaxiRideStatus, Prisma, ProviderType, ProviderVerificationStatus, type PetTaxiRide } from "@prisma/client";
import type { PetTaxiDriverStateDto, PetTaxiPointDto, PetTaxiQuoteDto, PetTaxiRequestDto, PetTaxiRideDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ValidationApiException } from "../../common/errors/api-exception";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { MapsService, haversineMeters, straightLineRoute, validLatLng, type LatLng } from "../maps/maps.service";
import { computeFare, normalizeCity, pickRule, type FareBreakdown } from "./pet-taxi-fare.policy";

/** How long a request waits for a driver before it reports "no driver nearby". */
export const SEARCH_WINDOW_MS = 10 * 60 * 1000;
/** A driver counts as online only if their phone reported in this recently. */
export const PRESENCE_FRESH_MS = 3 * 60 * 1000;
/** Requests are offered to online drivers within this straight-line distance (or to all, if their position is unknown). */
export const OFFER_RADIUS_KM = 25;
const OPEN: PetTaxiRideStatus[] = [PetTaxiRideStatus.SEARCHING, PetTaxiRideStatus.DRIVER_ASSIGNED, PetTaxiRideStatus.ARRIVING, PetTaxiRideStatus.PICKED_UP];
const BEFORE_PICKUP: PetTaxiRideStatus[] = [PetTaxiRideStatus.DRIVER_ASSIGNED, PetTaxiRideStatus.ARRIVING];
/** The order a driver moves a ride; each step only from the one before it. */
const NEXT: Partial<Record<PetTaxiRideStatus, PetTaxiRideStatus>> = {
  [PetTaxiRideStatus.DRIVER_ASSIGNED]: PetTaxiRideStatus.ARRIVING,
  [PetTaxiRideStatus.ARRIVING]: PetTaxiRideStatus.PICKED_UP,
  [PetTaxiRideStatus.PICKED_UP]: PetTaxiRideStatus.COMPLETED,
};

type Point = { label: string; latitude: number; longitude: number; city?: string | null; note?: string | null };
type RideWithNames = PetTaxiRide & { user?: { displayName: string; phone: string | null } };

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

function etaSeconds(ride: PetTaxiRide): number | null {
  if (ride.driverLatitude == null || ride.driverLongitude == null) return null;
  const driver = { latitude: ride.driverLatitude, longitude: ride.driverLongitude };
  if (BEFORE_PICKUP.includes(ride.status)) return straightLineRoute(driver, { latitude: ride.pickupLatitude, longitude: ride.pickupLongitude }).durationSeconds;
  if (ride.status === PetTaxiRideStatus.PICKED_UP) return straightLineRoute(driver, { latitude: ride.dropoffLatitude, longitude: ride.dropoffLongitude }).durationSeconds;
  return null;
}

/**
 * On-demand pet taxi. Members get a server-computed fare (the client never sends a price), request a ride, and follow
 * it; drivers of verified PET_TAXI organizations go online from their phone, see nearby requests, and the first to
 * accept takes it (conditional update). Contact details cross only after acceptance, and only for that ride.
 */
@Injectable()
export class PetTaxiService {
  constructor(private readonly prisma: PrismaService, private readonly maps: MapsService) {}

  // ---------------------------------------------------------------- member

  async quote(input: { pickup: Point; dropoff: Point; carrierSize: PetTaxiCarrierSize; petCount: number }): Promise<PetTaxiQuoteDto & { breakdownRaw?: FareBreakdown }> {
    if (!validLatLng(input.pickup) || !validLatLng(input.dropoff)) throw new ValidationApiException({ field: "points", reason: "INVALID_COORDINATES" });
    const meters = haversineMeters(input.pickup, input.dropoff);
    if (meters < 150) throw new ValidationApiException({ field: "dropoff", reason: "TOO_CLOSE" });
    if (meters > 150_000) throw new ValidationApiException({ field: "dropoff", reason: "TOO_FAR" });
    const [route, rules] = await Promise.all([this.maps.route(input.pickup, input.dropoff), this.prisma.petTaxiFareRule.findMany()]);
    const rule = pickRule(rules, input.pickup.city);
    if (!rule) return { available: false, reason: "NOT_PRICED", fareIrr: null, breakdown: null, distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds, routeSource: route.source, fareRuleCity: null };
    const { fareIrr, breakdown } = computeFare(rule, route, input.carrierSize, Math.max(1, input.petCount));
    return { available: true, reason: null, fareIrr, breakdown, distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds, routeSource: route.source, fareRuleCity: rule.city };
  }

  async request(userId: string, input: { pickup: Point; dropoff: Point; carrierSize: PetTaxiCarrierSize; petIds: string[] }, idempotencyKey: string | undefined): Promise<PetTaxiRideDto> {
    const key = idempotencyKey?.trim();
    if (!key || key.length > 120) throw new ValidationApiException({ field: "idempotencyKey", reason: "REQUIRED" });
    const replay = await this.prisma.petTaxiRide.findUnique({ where: { idempotencyKey: key } });
    if (replay) {
      if (replay.userId !== userId) throw new ValidationApiException({ field: "idempotencyKey", reason: "CONFLICT" });
      return this.memberView(replay.id, userId);
    }
    const open = await this.prisma.petTaxiRide.findFirst({ where: { userId, status: { in: OPEN } } });
    if (open && !(open.status === PetTaxiRideStatus.SEARCHING && open.searchExpiresAt <= new Date())) throw new ValidationApiException({ field: "ride", reason: "RIDE_ALREADY_OPEN", rideId: open.id });
    // Only the member's own household pets travel; access is through household membership.
    const petIds = [...new Set(input.petIds)];
    if (!petIds.length || petIds.length > 4) throw new ValidationApiException({ field: "petIds", reason: "ONE_TO_FOUR_PETS" });
    const pets = await this.prisma.pet.findMany({ where: { id: { in: petIds }, deletedAt: null, household: { members: { some: { userId } } } }, select: { id: true, householdId: true } });
    if (pets.length !== petIds.length) throw new ValidationApiException({ field: "petIds", reason: "NOT_YOUR_PETS" });
    const quote = await this.quote({ pickup: input.pickup, dropoff: input.dropoff, carrierSize: input.carrierSize, petCount: petIds.length });
    if (!quote.available || !quote.fareIrr || !quote.breakdown) throw new ValidationApiException({ field: "fare", reason: "NOT_PRICED" });
    const ride = await this.prisma.petTaxiRide.create({
      data: {
        userId,
        householdId: pets[0]!.householdId,
        petIds,
        carrierSize: input.carrierSize,
        idempotencyKey: key,
        pickupLabel: input.pickup.label.trim().slice(0, 200),
        pickupLatitude: input.pickup.latitude,
        pickupLongitude: input.pickup.longitude,
        pickupCity: normalizeCity(input.pickup.city) || null,
        pickupNote: input.pickup.note?.trim().slice(0, 300) || null,
        dropoffLabel: input.dropoff.label.trim().slice(0, 200),
        dropoffLatitude: input.dropoff.latitude,
        dropoffLongitude: input.dropoff.longitude,
        distanceMeters: quote.distanceMeters,
        durationSeconds: quote.durationSeconds,
        routeSource: quote.routeSource,
        fareIrr: quote.fareIrr,
        fareBreakdown: quote.breakdown as unknown as Prisma.InputJsonValue,
        fareRuleCity: quote.fareRuleCity ?? "*",
        searchExpiresAt: new Date(Date.now() + SEARCH_WINDOW_MS),
      },
    });
    return this.memberView(ride.id, userId);
  }

  async list(userId: string): Promise<PetTaxiRideDto[]> {
    await this.expireSearches();
    const rides = await this.prisma.petTaxiRide.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20 });
    return Promise.all(rides.map((r) => this.toDto(r, "member")));
  }

  async memberView(rideId: string, userId: string): Promise<PetTaxiRideDto> {
    await this.expireSearches();
    const ride = await this.prisma.petTaxiRide.findUnique({ where: { id: rideId } });
    if (!ride || ride.userId !== userId) throw new ValidationApiException({ field: "ride", reason: "NOT_FOUND" });
    return this.toDto(ride, "member");
  }

  async cancelByMember(rideId: string, userId: string, reason?: string): Promise<PetTaxiRideDto> {
    const done = await this.prisma.petTaxiRide.updateMany({
      where: { id: rideId, userId, status: { in: [PetTaxiRideStatus.SEARCHING, ...BEFORE_PICKUP] } },
      data: { status: PetTaxiRideStatus.CANCELLED_BY_MEMBER, cancelledAt: new Date(), cancelReason: reason?.trim().slice(0, 300) || "MEMBER_CANCELLED" },
    });
    if (!done.count) throw new ValidationApiException({ field: "ride", reason: "NOT_CANCELLABLE" });
    return this.memberView(rideId, userId);
  }

  async rate(rideId: string, userId: string, rating: number, comment?: string): Promise<PetTaxiRideDto> {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ValidationApiException({ field: "rating", reason: "ONE_TO_FIVE" });
    const done = await this.prisma.petTaxiRide.updateMany({
      where: { id: rideId, userId, status: PetTaxiRideStatus.COMPLETED, ratedAt: null },
      data: { rating, ratingComment: comment?.trim().slice(0, 500) || null, ratedAt: new Date() },
    });
    if (!done.count) throw new ValidationApiException({ field: "ride", reason: "NOT_RATEABLE" });
    return this.memberView(rideId, userId);
  }

  // ---------------------------------------------------------------- driver

  private async eligibility(ctx: ResolvedProviderContext) {
    const org = await this.prisma.providerOrganization.findUnique({ where: { id: ctx.organizationId }, select: { type: true, verificationStatus: true, name: true, phone: true } });
    if (!org || org.type !== ProviderType.PET_TAXI) return { ok: false as const, reason: "NOT_PET_TAXI" as const, org };
    if (org.verificationStatus !== ProviderVerificationStatus.VERIFIED) return { ok: false as const, reason: "NOT_VERIFIED" as const, org };
    return { ok: true as const, reason: null, org };
  }

  private async requireEligible(ctx: ResolvedProviderContext) {
    const e = await this.eligibility(ctx);
    if (!e.ok) throw new ValidationApiException({ field: "provider", reason: e.reason });
    return e.org!;
  }

  async driverState(ctx: ResolvedProviderContext): Promise<PetTaxiDriverStateDto> {
    const e = await this.eligibility(ctx);
    const presence = await this.prisma.petTaxiDriverPresence.findUnique({ where: { providerUserId: ctx.providerUserId } });
    const online = !!presence?.online && !!presence.updatedAt && Date.now() - presence.updatedAt.getTime() < PRESENCE_FRESH_MS;
    const base = { eligible: e.ok, reason: e.reason, online, organizationName: e.org?.name ?? ctx.organizationName };
    if (!e.ok) return { ...base, activeRide: null, requests: [] };
    await this.expireSearches();
    const active = await this.prisma.petTaxiRide.findFirst({ where: { driverProviderUserId: ctx.providerUserId, status: { in: [PetTaxiRideStatus.DRIVER_ASSIGNED, PetTaxiRideStatus.ARRIVING, PetTaxiRideStatus.PICKED_UP] } }, include: { user: { select: { displayName: true, phone: true } } } });
    if (active) return { ...base, activeRide: await this.toDto(active, "driver"), requests: [] };
    return { ...base, activeRide: null, requests: online ? await this.openRequests(ctx, presence) : [] };
  }

  private async openRequests(ctx: ResolvedProviderContext, presence: { latitude: number | null; longitude: number | null } | null): Promise<PetTaxiRequestDto[]> {
    const rides = await this.prisma.petTaxiRide.findMany({
      where: { status: PetTaxiRideStatus.SEARCHING, searchExpiresAt: { gt: new Date() }, declines: { none: { providerUserId: ctx.providerUserId } }, userId: { not: ctx.userId } },
      orderBy: { createdAt: "asc" },
      take: 30,
    });
    const here: LatLng | null = presence?.latitude != null && presence.longitude != null ? { latitude: presence.latitude, longitude: presence.longitude } : null;
    return rides
      .map((r) => ({ r, km: here ? haversineMeters(here, { latitude: r.pickupLatitude, longitude: r.pickupLongitude }) / 1000 : null }))
      .filter(({ km }) => km === null || km <= OFFER_RADIUS_KM)
      .sort((a, b) => (a.km ?? 0) - (b.km ?? 0))
      .slice(0, 10)
      .map(({ r, km }) => ({
        id: r.id,
        pickup: { label: r.pickupLabel, latitude: r.pickupLatitude, longitude: r.pickupLongitude, city: r.pickupCity, note: r.pickupNote },
        dropoff: { label: r.dropoffLabel, latitude: r.dropoffLatitude, longitude: r.dropoffLongitude },
        carrierSize: r.carrierSize,
        petCount: r.petIds.length,
        fareIrr: r.fareIrr,
        distanceMeters: r.distanceMeters,
        durationSeconds: r.durationSeconds,
        kmFromYou: km === null ? null : Math.round(km * 10) / 10,
        searchExpiresAt: r.searchExpiresAt.toISOString(),
      }));
  }

  /** Online/offline plus the phone's position; while on a ride the position also moves the member's map. */
  async presence(ctx: ResolvedProviderContext, input: { online: boolean; latitude?: number; longitude?: number }): Promise<PetTaxiDriverStateDto> {
    await this.requireEligible(ctx);
    const point = input.latitude != null && input.longitude != null && validLatLng({ latitude: input.latitude, longitude: input.longitude }) ? { latitude: input.latitude, longitude: input.longitude, locatedAt: new Date() } : {};
    await this.prisma.petTaxiDriverPresence.upsert({
      where: { providerUserId: ctx.providerUserId },
      create: { providerUserId: ctx.providerUserId, userId: ctx.userId, providerOrganizationId: ctx.organizationId, online: input.online, ...point },
      update: { online: input.online, providerOrganizationId: ctx.organizationId, ...point },
    });
    if ("latitude" in point) {
      await this.prisma.petTaxiRide.updateMany({
        where: { driverProviderUserId: ctx.providerUserId, status: { in: [PetTaxiRideStatus.DRIVER_ASSIGNED, PetTaxiRideStatus.ARRIVING, PetTaxiRideStatus.PICKED_UP] } },
        data: { driverLatitude: point.latitude, driverLongitude: point.longitude, driverLocatedAt: point.locatedAt },
      });
    }
    return this.driverState(ctx);
  }

  async accept(ctx: ResolvedProviderContext, rideId: string): Promise<PetTaxiDriverStateDto> {
    await this.requireEligible(ctx);
    const busy = await this.prisma.petTaxiRide.count({ where: { driverProviderUserId: ctx.providerUserId, status: { in: [PetTaxiRideStatus.DRIVER_ASSIGNED, PetTaxiRideStatus.ARRIVING, PetTaxiRideStatus.PICKED_UP] } } });
    if (busy) throw new ValidationApiException({ field: "ride", reason: "FINISH_CURRENT_RIDE_FIRST" });
    const presence = await this.prisma.petTaxiDriverPresence.findUnique({ where: { providerUserId: ctx.providerUserId } });
    // First driver wins: the status condition makes a second acceptance match nothing.
    const done = await this.prisma.petTaxiRide.updateMany({
      where: { id: rideId, status: PetTaxiRideStatus.SEARCHING, searchExpiresAt: { gt: new Date() }, userId: { not: ctx.userId } },
      data: {
        status: PetTaxiRideStatus.DRIVER_ASSIGNED,
        assignedAt: new Date(),
        providerOrganizationId: ctx.organizationId,
        driverProviderUserId: ctx.providerUserId,
        driverUserId: ctx.userId,
        driverLatitude: presence?.latitude ?? null,
        driverLongitude: presence?.longitude ?? null,
        driverLocatedAt: presence?.locatedAt ?? null,
      },
    });
    if (!done.count) throw new ValidationApiException({ field: "ride", reason: "NO_LONGER_AVAILABLE" });
    return this.driverState(ctx);
  }

  async decline(ctx: ResolvedProviderContext, rideId: string): Promise<PetTaxiDriverStateDto> {
    await this.requireEligible(ctx);
    await this.prisma.petTaxiRideDecline.upsert({ where: { rideId_providerUserId: { rideId, providerUserId: ctx.providerUserId } }, create: { rideId, providerUserId: ctx.providerUserId }, update: {} });
    return this.driverState(ctx);
  }

  async advance(ctx: ResolvedProviderContext, rideId: string, to: PetTaxiRideStatus): Promise<PetTaxiDriverStateDto> {
    await this.requireEligible(ctx);
    const ride = await this.prisma.petTaxiRide.findUnique({ where: { id: rideId } });
    if (!ride || ride.driverProviderUserId !== ctx.providerUserId) throw new ValidationApiException({ field: "ride", reason: "NOT_FOUND" });
    if (NEXT[ride.status] !== to) throw new ValidationApiException({ field: "status", reason: "OUT_OF_ORDER", from: ride.status, to });
    const stamp = to === PetTaxiRideStatus.ARRIVING ? { arrivingAt: new Date() } : to === PetTaxiRideStatus.PICKED_UP ? { pickedUpAt: new Date() } : { completedAt: new Date() };
    const done = await this.prisma.petTaxiRide.updateMany({ where: { id: rideId, status: ride.status, driverProviderUserId: ctx.providerUserId }, data: { status: to, ...stamp } });
    if (!done.count) throw new ValidationApiException({ field: "status", reason: "OUT_OF_ORDER" });
    return this.driverState(ctx);
  }

  /** A driver who cannot make it before pickup hands the ride back to the search (and is not offered it again). */
  async release(ctx: ResolvedProviderContext, rideId: string, reason: string): Promise<PetTaxiDriverStateDto> {
    await this.requireEligible(ctx);
    const done = await this.prisma.$transaction(async (tx) => {
      const count = await tx.petTaxiRide.updateMany({
        where: { id: rideId, driverProviderUserId: ctx.providerUserId, status: { in: BEFORE_PICKUP } },
        data: { status: PetTaxiRideStatus.SEARCHING, searchExpiresAt: new Date(Date.now() + SEARCH_WINDOW_MS), providerOrganizationId: null, driverProviderUserId: null, driverUserId: null, driverLatitude: null, driverLongitude: null, driverLocatedAt: null, assignedAt: null, arrivingAt: null, cancelReason: `DRIVER_RELEASED: ${reason.trim().slice(0, 200)}` },
      });
      if (count.count) await tx.petTaxiRideDecline.upsert({ where: { rideId_providerUserId: { rideId, providerUserId: ctx.providerUserId } }, create: { rideId, providerUserId: ctx.providerUserId }, update: {} });
      return count.count;
    });
    if (!done) throw new ValidationApiException({ field: "ride", reason: "NOT_RELEASABLE" });
    return this.driverState(ctx);
  }

  // ---------------------------------------------------------------- shared

  /** Searches past their window become NO_DRIVER (written lazily on read; nothing else depends on the exact moment). */
  async expireSearches(now = new Date()) {
    await this.prisma.petTaxiRide.updateMany({ where: { status: PetTaxiRideStatus.SEARCHING, searchExpiresAt: { lte: now } }, data: { status: PetTaxiRideStatus.NO_DRIVER } });
  }

  async toDto(ride: RideWithNames, viewer: "member" | "driver" | "admin"): Promise<PetTaxiRideDto> {
    const assigned = !!ride.driverProviderUserId && OPEN.concat(PetTaxiRideStatus.COMPLETED).includes(ride.status);
    let driver: PetTaxiRideDto["driver"] = null;
    if (assigned && viewer !== "driver" && ride.driverUserId && ride.providerOrganizationId) {
      const [user, org] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: ride.driverUserId }, select: { displayName: true } }),
        this.prisma.providerOrganization.findUnique({ where: { id: ride.providerOrganizationId }, select: { name: true, phone: true } }),
      ]);
      const live = ride.status !== PetTaxiRideStatus.COMPLETED;
      driver = { name: user?.displayName ?? "", organizationName: org?.name ?? "", phone: live ? org?.phone ?? null : null, latitude: live ? ride.driverLatitude : null, longitude: live ? ride.driverLongitude : null, locatedAt: live ? iso(ride.driverLocatedAt) : null };
    }
    let member: PetTaxiRideDto["member"] = null;
    if (viewer === "driver" && assigned && ride.status !== PetTaxiRideStatus.COMPLETED) {
      const user = ride.user ?? (await this.prisma.user.findUnique({ where: { id: ride.userId }, select: { displayName: true, phone: true } }));
      member = { name: user?.displayName ?? "", phone: user?.phone ?? null };
    }
    const point = (label: string, latitude: number, longitude: number, city?: string | null, note?: string | null): PetTaxiPointDto => ({ label, latitude, longitude, city: city ?? null, note: note ?? null });
    return {
      id: ride.id,
      status: ride.status,
      carrierSize: ride.carrierSize,
      petIds: ride.petIds,
      pickup: point(ride.pickupLabel, ride.pickupLatitude, ride.pickupLongitude, ride.pickupCity, ride.pickupNote),
      dropoff: point(ride.dropoffLabel, ride.dropoffLatitude, ride.dropoffLongitude),
      fareIrr: ride.fareIrr,
      breakdown: ride.fareBreakdown as unknown as PetTaxiRideDto["breakdown"],
      distanceMeters: ride.distanceMeters,
      durationSeconds: ride.durationSeconds,
      routeSource: ride.routeSource as PetTaxiRideDto["routeSource"],
      searchExpiresAt: ride.searchExpiresAt.toISOString(),
      driver,
      member,
      etaSeconds: etaSeconds(ride),
      assignedAt: iso(ride.assignedAt),
      arrivingAt: iso(ride.arrivingAt),
      pickedUpAt: iso(ride.pickedUpAt),
      completedAt: iso(ride.completedAt),
      cancelledAt: iso(ride.cancelledAt),
      cancelReason: ride.cancelReason,
      rating: ride.rating,
      ratingComment: ride.ratingComment,
      createdAt: ride.createdAt.toISOString(),
    };
  }
}
