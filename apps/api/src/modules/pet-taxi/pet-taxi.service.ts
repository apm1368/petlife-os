import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PetTaxiCarrierSize, PetTaxiDriverStatus, PetTaxiRideStatus, Prisma, ProviderType, ProviderUserRole, ProviderVerificationStatus, type PetTaxiDriver as PetTaxiDriverRow, type PetTaxiRide } from "@prisma/client";
import type { PetTaxiDriverDto, PetTaxiDriversDto, PetTaxiDriverStateDto, PetTaxiPointDto, PetTaxiQuoteDto, PetTaxiRequestDto, PetTaxiRideDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ValidationApiException } from "../../common/errors/api-exception";
import { registerWorker, trackWorker } from "../../common/workers/worker-heartbeat";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { MapsService, haversineMeters, straightLineRoute, validLatLng, type LatLng } from "../maps/maps.service";
import { approximate, computeFare, normalizeCity, pickRuleForPoint, type FareBreakdown } from "./pet-taxi-fare.policy";

/** How long a request waits for a driver before it reports "no driver nearby". */
export const SEARCH_WINDOW_MS = 10 * 60 * 1000;
/** A driver counts as online only if their phone reported in this recently. */
export const PRESENCE_FRESH_MS = 3 * 60 * 1000;
/** A driver's position counts only if the phone sent it this recently (requests, accepting, completing). */
export const POSITION_FRESH_MS = 2 * 60 * 1000;
/** Requests are offered to online drivers with a fresh position within this straight-line distance. */
export const OFFER_RADIUS_KM = 25;
/** A ride can be completed this close to the drop-off (or after half the estimated trip time). */
export const COMPLETE_NEAR_DROPOFF_M = 1_500;
/** Finished rides keep exact places this long, then only a ~1 km grid point and no labels. */
export const RETENTION_DAYS = 30;
const MAINTENANCE_TICK_MS = 60 * 1000;
const RETENTION_EVERY_MS = 60 * 60 * 1000;
const OPEN: PetTaxiRideStatus[] = [PetTaxiRideStatus.SEARCHING, PetTaxiRideStatus.DRIVER_ASSIGNED, PetTaxiRideStatus.ARRIVING, PetTaxiRideStatus.PICKED_UP];
const ACTIVE: PetTaxiRideStatus[] = [PetTaxiRideStatus.DRIVER_ASSIGNED, PetTaxiRideStatus.ARRIVING, PetTaxiRideStatus.PICKED_UP];
const FINISHED: PetTaxiRideStatus[] = [PetTaxiRideStatus.COMPLETED, PetTaxiRideStatus.CANCELLED_BY_MEMBER, PetTaxiRideStatus.CANCELLED_BY_DRIVER, PetTaxiRideStatus.NO_DRIVER];
/** Roles that may drive; a VET of a pet-taxi organization does not. */
export const DRIVER_ROLES: ProviderUserRole[] = [ProviderUserRole.OWNER, ProviderUserRole.STAFF];
const fresh = (at: Date | null | undefined, now = Date.now()) => !!at && now - at.getTime() < POSITION_FRESH_MS;
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
 * On-demand pet taxi. Members get a server-computed fare (the client never sends a price, and the fare table comes
 * from where the pickup is), request a ride, and follow it. Staff-verified drivers of verified PET_TAXI organizations
 * go online from their phone and see nearby requests as an approximate area only; the first to accept takes it and
 * only then sees the exact pickup, its label and note, and the member's contact.
 */
@Injectable()
export class PetTaxiService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PetTaxiService.name);
  private timer: NodeJS.Timeout | null = null;
  private lastRetention = 0;

  constructor(private readonly prisma: PrismaService, private readonly maps: MapsService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    registerWorker("pet-taxi-maintenance", MAINTENANCE_TICK_MS);
    this.timer = setInterval(() => void trackWorker("pet-taxi-maintenance", MAINTENANCE_TICK_MS, () => this.maintenance()).catch((e) => this.logger.error("Pet taxi maintenance failed", e)), MAINTENANCE_TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Expires unanswered searches every minute; coarsens old finished rides every hour. */
  async maintenance(now = new Date()) {
    await this.expireSearches(now);
    if (now.getTime() - this.lastRetention >= RETENTION_EVERY_MS) {
      this.lastRetention = now.getTime();
      await this.applyRetention(now);
    }
  }

  // ---------------------------------------------------------------- member

  async quote(input: { pickup: Point; dropoff: Point; carrierSize: PetTaxiCarrierSize; petCount: number }): Promise<PetTaxiQuoteDto & { breakdownRaw?: FareBreakdown }> {
    if (!validLatLng(input.pickup) || !validLatLng(input.dropoff)) throw new ValidationApiException({ field: "points", reason: "INVALID_COORDINATES" });
    const meters = haversineMeters(input.pickup, input.dropoff);
    if (meters < 150) throw new ValidationApiException({ field: "dropoff", reason: "TOO_CLOSE" });
    if (meters > 150_000) throw new ValidationApiException({ field: "dropoff", reason: "TOO_FAR" });
    const [route, rules] = await Promise.all([this.maps.route(input.pickup, input.dropoff), this.prisma.petTaxiFareRule.findMany()]);
    // The fare table comes from where the pickup is; the typed city is only a label.
    const rule = pickRuleForPoint(rules, input.pickup);
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
        pickupCity: (quote.fareRuleCity && quote.fareRuleCity !== "*" ? quote.fareRuleCity : normalizeCity(input.pickup.city)) || null,
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
    const rides = await this.prisma.petTaxiRide.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20 });
    return Promise.all(rides.map((r) => this.toDto(r, "member")));
  }

  async memberView(rideId: string, userId: string): Promise<PetTaxiRideDto> {
    const ride = await this.prisma.petTaxiRide.findUnique({ where: { id: rideId } });
    if (!ride || ride.userId !== userId) throw new ValidationApiException({ field: "ride", reason: "NOT_FOUND" });
    return this.toDto(ride, "member");
  }

  async cancelByMember(rideId: string, userId: string, reason?: string): Promise<PetTaxiRideDto> {
    const done = await this.prisma.petTaxiRide.updateMany({
      where: { id: rideId, userId, status: { in: [PetTaxiRideStatus.SEARCHING, ...BEFORE_PICKUP] } },
      data: { status: PetTaxiRideStatus.CANCELLED_BY_MEMBER, cancelledAt: new Date(), cancelReason: reason?.trim().slice(0, 300) || "MEMBER_CANCELLED", driverLatitude: null, driverLongitude: null, driverLocatedAt: null },
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

  /** Driving needs a verified organization, a driving role, and this person's licence and vehicle checked by staff. */
  private async requireDriver(ctx: ResolvedProviderContext) {
    await this.requireEligible(ctx);
    if (!DRIVER_ROLES.includes(ctx.role)) throw new ValidationApiException({ field: "provider", reason: "ROLE_CANNOT_DRIVE" });
    const driver = await this.prisma.petTaxiDriver.findUnique({ where: { providerUserId: ctx.providerUserId } });
    if (!driver || driver.providerOrganizationId !== ctx.organizationId) throw new ValidationApiException({ field: "driver", reason: "DRIVER_NOT_REGISTERED" });
    if (driver.status !== PetTaxiDriverStatus.VERIFIED) throw new ValidationApiException({ field: "driver", reason: `DRIVER_${driver.status}` });
    return driver;
  }

  async toDriverDto(d: PetTaxiDriverRow, name?: string): Promise<PetTaxiDriverDto> {
    const displayName = name ?? (await this.prisma.user.findUnique({ where: { id: d.userId }, select: { displayName: true } }))?.displayName ?? "";
    return {
      id: d.id,
      providerUserId: d.providerUserId,
      name: displayName,
      licenceNumber: d.licenceNumber,
      vehiclePlate: d.vehiclePlate,
      vehicleDescription: d.vehicleDescription,
      status: d.status,
      statusReason: d.statusReason,
      verifiedAt: iso(d.verifiedAt),
      createdAt: d.createdAt.toISOString(),
    };
  }

  async driverState(ctx: ResolvedProviderContext): Promise<PetTaxiDriverStateDto> {
    const e = await this.eligibility(ctx);
    const [presence, record] = await Promise.all([
      this.prisma.petTaxiDriverPresence.findUnique({ where: { providerUserId: ctx.providerUserId } }),
      this.prisma.petTaxiDriver.findUnique({ where: { providerUserId: ctx.providerUserId } }),
    ]);
    const own = record && record.providerOrganizationId === ctx.organizationId ? record : null;
    const canDrive = e.ok && DRIVER_ROLES.includes(ctx.role) && own?.status === PetTaxiDriverStatus.VERIFIED;
    const online = canDrive && !!presence?.online && !!presence.updatedAt && Date.now() - presence.updatedAt.getTime() < PRESENCE_FRESH_MS;
    const base = { eligible: e.ok, reason: e.reason, online, organizationName: e.org?.name ?? ctx.organizationName, canDrive, isOwner: ctx.role === ProviderUserRole.OWNER, driver: own ? await this.toDriverDto(own) : null };
    if (!e.ok) return { ...base, activeRide: null, requests: [] };
    const active = await this.prisma.petTaxiRide.findFirst({ where: { driverProviderUserId: ctx.providerUserId, status: { in: ACTIVE } }, include: { user: { select: { displayName: true, phone: true } } } });
    if (active) return { ...base, activeRide: await this.toDto(active, "driver"), requests: [] };
    return { ...base, activeRide: null, requests: online ? await this.openRequests(ctx, presence) : [] };
  }

  /**
   * Requests near a driver whose phone sent a fresh position. Before accepting, a driver sees only a ~500 m grid point
   * and the city for pickup and drop-off — no address label, no note — and a distance rounded to half a kilometre.
   */
  private async openRequests(ctx: ResolvedProviderContext, presence: { latitude: number | null; longitude: number | null; locatedAt: Date | null } | null): Promise<PetTaxiRequestDto[]> {
    if (presence?.latitude == null || presence.longitude == null || !fresh(presence.locatedAt)) return [];
    const here: LatLng = { latitude: presence.latitude, longitude: presence.longitude };
    const rides = await this.prisma.petTaxiRide.findMany({
      where: { status: PetTaxiRideStatus.SEARCHING, searchExpiresAt: { gt: new Date() }, declines: { none: { providerUserId: ctx.providerUserId } }, userId: { not: ctx.userId } },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    return rides
      .map((r) => {
        const pickup = { latitude: approximate(r.pickupLatitude), longitude: approximate(r.pickupLongitude) };
        const dropoff = { latitude: approximate(r.dropoffLatitude), longitude: approximate(r.dropoffLongitude) };
        return { r, pickup, dropoff, km: haversineMeters(here, pickup) / 1000 };
      })
      .filter(({ km }) => km <= OFFER_RADIUS_KM)
      .sort((a, b) => a.km - b.km)
      .slice(0, 10)
      .map(({ r, pickup, dropoff, km }) => ({
        id: r.id,
        approximate: true,
        pickup: { label: "", ...pickup, city: r.pickupCity, note: null },
        dropoff: { label: "", ...dropoff, city: null, note: null },
        carrierSize: r.carrierSize,
        petCount: r.petIds.length,
        fareIrr: r.fareIrr,
        distanceMeters: r.distanceMeters,
        durationSeconds: r.durationSeconds,
        kmFromYou: Math.max(0.5, Math.round(km * 2) / 2),
        searchExpiresAt: r.searchExpiresAt.toISOString(),
      }));
  }

  /** Online/offline plus the phone's position; while on a ride the position also moves the member's map. Offline keeps no position. */
  async presence(ctx: ResolvedProviderContext, input: { online: boolean; latitude?: number; longitude?: number }): Promise<PetTaxiDriverStateDto> {
    if (input.online) await this.requireDriver(ctx);
    else await this.requireEligible(ctx);
    const point = input.online && input.latitude != null && input.longitude != null && validLatLng({ latitude: input.latitude, longitude: input.longitude }) ? { latitude: input.latitude, longitude: input.longitude, locatedAt: new Date() } : null;
    const data = input.online ? { online: true, ...(point ?? {}) } : { online: false, latitude: null, longitude: null, locatedAt: null };
    await this.prisma.petTaxiDriverPresence.upsert({
      where: { providerUserId: ctx.providerUserId },
      create: { providerUserId: ctx.providerUserId, userId: ctx.userId, providerOrganizationId: ctx.organizationId, ...data },
      update: { providerOrganizationId: ctx.organizationId, ...data },
    });
    if (point) {
      await this.prisma.petTaxiRide.updateMany({
        where: { driverProviderUserId: ctx.providerUserId, status: { in: ACTIVE } },
        data: { driverLatitude: point.latitude, driverLongitude: point.longitude, driverLocatedAt: point.locatedAt },
      });
    }
    return this.driverState(ctx);
  }

  async accept(ctx: ResolvedProviderContext, rideId: string): Promise<PetTaxiDriverStateDto> {
    await this.requireDriver(ctx);
    const done = await this.prisma.$transaction(async (tx) => {
      // One driver, one ride: this driver's presence row is locked, so parallel accepts by the same driver run in turn
      // and the second one sees the first ride.
      const rows = await tx.$queryRaw<{ online: boolean; latitude: number | null; longitude: number | null; locatedAt: Date | null }[]>`
        SELECT "online", "latitude", "longitude", "locatedAt" FROM "pet_taxi_driver_presence" WHERE "providerUserId" = ${ctx.providerUserId}::uuid FOR UPDATE`;
      const presence = rows[0];
      if (!presence?.online || presence.latitude == null || presence.longitude == null || !fresh(presence.locatedAt)) throw new ValidationApiException({ field: "presence", reason: "GO_ONLINE_WITH_LOCATION" });
      const busy = await tx.petTaxiRide.count({ where: { driverProviderUserId: ctx.providerUserId, status: { in: ACTIVE } } });
      if (busy) throw new ValidationApiException({ field: "ride", reason: "FINISH_CURRENT_RIDE_FIRST" });
      // First driver wins: the status condition makes a second acceptance match nothing. A ride this driver passed on
      // or handed back is not theirs to take.
      return tx.petTaxiRide.updateMany({
        where: { id: rideId, status: PetTaxiRideStatus.SEARCHING, searchExpiresAt: { gt: new Date() }, userId: { not: ctx.userId }, declines: { none: { providerUserId: ctx.providerUserId } } },
        data: {
          status: PetTaxiRideStatus.DRIVER_ASSIGNED,
          assignedAt: new Date(),
          providerOrganizationId: ctx.organizationId,
          driverProviderUserId: ctx.providerUserId,
          driverUserId: ctx.userId,
          driverLatitude: presence.latitude,
          driverLongitude: presence.longitude,
          driverLocatedAt: presence.locatedAt,
        },
      });
    });
    if (!done.count) throw new ValidationApiException({ field: "ride", reason: "NO_LONGER_AVAILABLE" });
    return this.driverState(ctx);
  }

  async decline(ctx: ResolvedProviderContext, rideId: string): Promise<PetTaxiDriverStateDto> {
    await this.requireDriver(ctx);
    await this.prisma.petTaxiRideDecline.upsert({ where: { rideId_providerUserId: { rideId, providerUserId: ctx.providerUserId } }, create: { rideId, providerUserId: ctx.providerUserId }, update: {} });
    return this.driverState(ctx);
  }

  async advance(ctx: ResolvedProviderContext, rideId: string, to: PetTaxiRideStatus): Promise<PetTaxiDriverStateDto> {
    await this.requireDriver(ctx);
    const ride = await this.prisma.petTaxiRide.findUnique({ where: { id: rideId } });
    if (!ride || ride.driverProviderUserId !== ctx.providerUserId) throw new ValidationApiException({ field: "ride", reason: "NOT_FOUND" });
    if (NEXT[ride.status] !== to) throw new ValidationApiException({ field: "status", reason: "OUT_OF_ORDER", from: ride.status, to });
    if (to === PetTaxiRideStatus.COMPLETED) {
      // Done means arrived: the phone is near the drop-off, or at least half the estimated trip has passed.
      const presence = await this.prisma.petTaxiDriverPresence.findUnique({ where: { providerUserId: ctx.providerUserId } });
      const near = presence?.latitude != null && presence.longitude != null && fresh(presence.locatedAt) && haversineMeters({ latitude: presence.latitude, longitude: presence.longitude }, { latitude: ride.dropoffLatitude, longitude: ride.dropoffLongitude }) <= COMPLETE_NEAR_DROPOFF_M;
      const longEnough = !!ride.pickedUpAt && Date.now() - ride.pickedUpAt.getTime() >= (ride.durationSeconds * 1000) / 2;
      if (!near && !longEnough) throw new ValidationApiException({ field: "status", reason: "NOT_AT_DROPOFF_YET" });
    }
    const stamp =
      to === PetTaxiRideStatus.ARRIVING
        ? { arrivingAt: new Date() }
        : to === PetTaxiRideStatus.PICKED_UP
          ? { pickedUpAt: new Date() }
          : { completedAt: new Date(), driverLatitude: null, driverLongitude: null, driverLocatedAt: null };
    const done = await this.prisma.petTaxiRide.updateMany({ where: { id: rideId, status: ride.status, driverProviderUserId: ctx.providerUserId }, data: { status: to, ...stamp } });
    if (!done.count) throw new ValidationApiException({ field: "status", reason: "OUT_OF_ORDER" });
    return this.driverState(ctx);
  }

  /** A driver who cannot make it before pickup hands the ride back to the search (and is not offered it again). */
  async release(ctx: ResolvedProviderContext, rideId: string, reason: string): Promise<PetTaxiDriverStateDto> {
    await this.requireDriver(ctx);
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

  // ---------------------------------------------------------------- the organization's drivers (owner)

  private async requireOwner(ctx: ResolvedProviderContext) {
    await this.requireEligible(ctx);
    if (ctx.role !== ProviderUserRole.OWNER) throw new ValidationApiException({ field: "provider", reason: "OWNER_ONLY" });
  }

  async drivers(ctx: ResolvedProviderContext): Promise<PetTaxiDriversDto> {
    await this.requireOwner(ctx);
    const [rows, members] = await Promise.all([
      this.prisma.petTaxiDriver.findMany({ where: { providerOrganizationId: ctx.organizationId }, orderBy: { createdAt: "asc" } }),
      this.prisma.providerUser.findMany({ where: { providerOrganizationId: ctx.organizationId, role: { in: DRIVER_ROLES }, removedAt: null }, select: { id: true, role: true, user: { select: { displayName: true } } }, orderBy: { createdAt: "asc" } }),
    ]);
    const nameOf = new Map(members.map((m) => [m.id, m.user.displayName]));
    return {
      drivers: await Promise.all(rows.map((d) => this.toDriverDto(d, nameOf.get(d.providerUserId)))),
      members: members.map((m) => ({ providerUserId: m.id, name: m.user.displayName, role: m.role as "OWNER" | "STAFF" })),
    };
  }

  /** The owner registers a member as a driver; new or changed licence/vehicle details wait for staff to check them. */
  async registerDriver(ctx: ResolvedProviderContext, input: { providerUserId: string; licenceNumber: string; vehiclePlate: string; vehicleDescription: string }): Promise<PetTaxiDriversDto> {
    await this.requireOwner(ctx);
    const member = await this.prisma.providerUser.findFirst({ where: { id: input.providerUserId, providerOrganizationId: ctx.organizationId, role: { in: DRIVER_ROLES }, removedAt: null }, select: { id: true, userId: true } });
    if (!member) throw new ValidationApiException({ field: "providerUserId", reason: "NOT_A_MEMBER" });
    const details = { licenceNumber: input.licenceNumber.trim().slice(0, 40), vehiclePlate: input.vehiclePlate.trim().slice(0, 20), vehicleDescription: input.vehicleDescription.trim().slice(0, 120) };
    const existing = await this.prisma.petTaxiDriver.findUnique({ where: { providerUserId: member.id } });
    if (existing && existing.providerOrganizationId !== ctx.organizationId) throw new ValidationApiException({ field: "providerUserId", reason: "NOT_A_MEMBER" });
    const changed = !existing || existing.licenceNumber !== details.licenceNumber || existing.vehiclePlate !== details.vehiclePlate || existing.vehicleDescription !== details.vehicleDescription;
    if (changed) {
      const recheck = { status: PetTaxiDriverStatus.PENDING, statusReason: null, verifiedByAdminId: null, verifiedAt: null };
      await this.prisma.petTaxiDriver.upsert({
        where: { providerUserId: member.id },
        create: { providerUserId: member.id, providerOrganizationId: ctx.organizationId, userId: member.userId, registeredByUserId: ctx.userId, ...details },
        update: { ...details, ...recheck },
      });
      // Until staff check the new details, this person cannot be online.
      if (existing) await this.prisma.petTaxiDriverPresence.updateMany({ where: { providerUserId: member.id }, data: { online: false, latitude: null, longitude: null, locatedAt: null } });
    }
    return this.drivers(ctx);
  }

  // ---------------------------------------------------------------- shared

  /** Searches past their window become NO_DRIVER (the maintenance tick; reads already show them as ended). */
  async expireSearches(now = new Date()) {
    await this.prisma.petTaxiRide.updateMany({ where: { status: PetTaxiRideStatus.SEARCHING, searchExpiresAt: { lte: now } }, data: { status: PetTaxiRideStatus.NO_DRIVER } });
  }

  /** Finished rides older than RETENTION_DAYS keep only a ~1 km grid point for pickup and drop-off, and no labels, note or driver position. */
  async applyRetention(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    return this.prisma.$executeRaw`
      UPDATE "pet_taxi_rides" SET
        "pickupLatitude" = ROUND("pickupLatitude"::numeric, 2)::double precision,
        "pickupLongitude" = ROUND("pickupLongitude"::numeric, 2)::double precision,
        "dropoffLatitude" = ROUND("dropoffLatitude"::numeric, 2)::double precision,
        "dropoffLongitude" = ROUND("dropoffLongitude"::numeric, 2)::double precision,
        "pickupLabel" = '',
        "dropoffLabel" = '',
        "pickupNote" = NULL,
        "driverLatitude" = NULL,
        "driverLongitude" = NULL,
        "driverLocatedAt" = NULL,
        "coordinatesRedactedAt" = ${now}
      WHERE "coordinatesRedactedAt" IS NULL
        AND "status"::text IN (${Prisma.join(FINISHED)})
        AND COALESCE("completedAt", "cancelledAt", "updatedAt") < ${cutoff}`;
  }

  async toDto(ride: RideWithNames, viewer: "member" | "driver" | "admin"): Promise<PetTaxiRideDto> {
    // A search past its window has ended even before the maintenance tick writes NO_DRIVER.
    const status = ride.status === PetTaxiRideStatus.SEARCHING && ride.searchExpiresAt <= new Date() ? PetTaxiRideStatus.NO_DRIVER : ride.status;
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
      status,
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
