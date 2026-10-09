import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { PetAccessFlags } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ValidationApiException } from "../../common/errors/api-exception";
import { PetAccessService } from "../pet-access/pet-access.service";
import { NotificationDeepLinks } from "../notifications/notification-deeplink.util";

/** Which access a viewer needs for an activity kind (per pet). */
type Need = "IDENTITY" | "HEALTH" | "CARE";
interface KindDef {
  kind: string;
  need: Need;
  deepLink: (p: Record<string, string>, aggregateId: string) => string | null;
}

/**
 * The allow-list: only member-meaningful events become activity. Admin, finance/ledger, security, clinic-internal
 * and chat events are never read here. Each maps to a stable message key (`activity.<KIND>`) for the client.
 */
const KINDS: Record<string, KindDef> = {
  PetCreated: { kind: "PET_ADDED", need: "IDENTITY", deepLink: (p) => NotificationDeepLinks.pet(p.petId!) },
  PetProfileUpdated: { kind: "PET_UPDATED", need: "IDENTITY", deepLink: (p) => NotificationDeepLinks.pet(p.petId!) },
  PetMemoryAdded: { kind: "MEMORY_ADDED", need: "IDENTITY", deepLink: (p) => NotificationDeepLinks.pet(p.petId!) },
  TripCreated: { kind: "TRIP_CREATED", need: "IDENTITY", deepLink: (p) => NotificationDeepLinks.trip(p.tripId!) },
  PetCareHandoffGranted: { kind: "CARE_HANDOFF_GRANTED", need: "IDENTITY", deepLink: (p) => NotificationDeepLinks.pet(p.petId!) },
  PetShareCardCreated: { kind: "SHARE_CARD_CREATED", need: "IDENTITY", deepLink: (p) => NotificationDeepLinks.pet(p.petId!) },
  CareReminderCompleted: { kind: "CARE_COMPLETED", need: "CARE", deepLink: (p) => NotificationDeepLinks.careItem(p.petId!, p.careItemId!) },
  MedicalDocumentAdded: { kind: "DOCUMENT_ADDED", need: "HEALTH", deepLink: (p) => NotificationDeepLinks.petDocuments(p.petId!) },
  AllergyAdded: { kind: "HEALTH_RECORD_ADDED", need: "HEALTH", deepLink: (p) => NotificationDeepLinks.petHealth(p.petId!) },
  ConditionAdded: { kind: "HEALTH_RECORD_ADDED", need: "HEALTH", deepLink: (p) => NotificationDeepLinks.petHealth(p.petId!) },
  MedicationAdded: { kind: "HEALTH_RECORD_ADDED", need: "HEALTH", deepLink: (p) => NotificationDeepLinks.petHealth(p.petId!) },
  LabResultAdded: { kind: "HEALTH_RECORD_ADDED", need: "HEALTH", deepLink: (p) => NotificationDeepLinks.petHealth(p.petId!) },
  VaccinationSummaryUpdated: { kind: "HEALTH_RECORD_ADDED", need: "HEALTH", deepLink: (p) => NotificationDeepLinks.petHealth(p.petId!) },
  ClinicalVisitCompleted: { kind: "VISIT_COMPLETED", need: "HEALTH", deepLink: (p) => NotificationDeepLinks.petHealth(p.petId!) },
  LostPetIncidentOpened: { kind: "LOST_REPORTED", need: "IDENTITY", deepLink: (p) => NotificationDeepLinks.lostIncident(p.petId!, p.incidentId!) },
  LostPetSightingSubmitted: { kind: "SIGHTING_REPORTED", need: "IDENTITY", deepLink: (p) => NotificationDeepLinks.lostIncident(p.petId!, p.incidentId!) },
  LostPetReunited: { kind: "REUNITED", need: "IDENTITY", deepLink: (p) => NotificationDeepLinks.lostIncident(p.petId!, p.incidentId!) },
  PetCardContactReceived: { kind: "FINDER_MESSAGE", need: "IDENTITY", deepLink: (p) => NotificationDeepLinks.pet(p.petId!) },
  PetAccessGranted: { kind: "ACCESS_SHARED", need: "IDENTITY", deepLink: (p) => NotificationDeepLinks.pet(p.petId!) },
  CareSuggestionCreated: { kind: "CARE_SUGGESTED", need: "CARE", deepLink: (p) => `/pets/${p.petId}/care` },
  CareSuggestionAccepted: { kind: "CARE_SUGGESTION_ACCEPTED", need: "CARE", deepLink: (p) => NotificationDeepLinks.careItem(p.petId!, p.careItemId!) },
  ServiceBookingConfirmed: { kind: "BOOKING_CONFIRMED", need: "IDENTITY", deepLink: (_p, id) => NotificationDeepLinks.booking(id) },
  BookingCompleted: { kind: "BOOKING_COMPLETED", need: "IDENTITY", deepLink: (_p, id) => NotificationDeepLinks.booking(id) },
};
const PET_TYPES = Object.keys(KINDS).filter((t) => !["ServiceBookingConfirmed", "BookingCompleted"].includes(t));
const BOOKING_TYPES = ["ServiceBookingConfirmed", "BookingCompleted"];
/** Payload fields that name the member who acted (never a provider or admin id). */
const ACTOR_FIELDS = ["actorUserId", "creatorUserId", "customerUserId", "authorUserId"];

type Row = { id: string; type: string; aggregateType: string | null; aggregateId: string | null; payload: Prisma.JsonValue; occurredAt: Date };

/**
 * Household activity read straight from `domain_events` (written in the same transaction as each change, so it
 * never shows something that was rolled back). Each entry is filtered per pet by the viewer's own access — health
 * kinds need canViewHealth, care kinds canViewCareProfile — and carries only ids, names and a message key.
 * Cursor pagination on (occurredAt, id), newest first.
 */
@Injectable()
export class HouseholdActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PetAccessService,
  ) {}

  async feed(householdId: string, viewerUserId: string, cursor?: string, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 50);
    const after = cursor ? decodeCursor(cursor) : null;
    const pets = await this.prisma.pet.findMany({ where: { householdId }, select: { id: true, name: true } });
    const flags = new Map<string, PetAccessFlags | null>();
    for (const p of pets) flags.set(p.id, await this.access.getEffectivePermissions(p.id, viewerUserId));
    const visiblePetIds = pets.filter((p) => flags.get(p.id)?.canViewIdentity).map((p) => p.id);
    if (!visiblePetIds.length) return { items: [], nextCursor: null };

    const out: ReturnType<HouseholdActivityService["toEntry"]>[] = [];
    let page = after;
    // Over-fetch in batches until the viewer-filtered page is full (health/care entries may be filtered out).
    for (let round = 0; round < 5 && out.length < take; round++) {
      const rows = await this.prisma.$queryRaw<Row[]>`
        SELECT e.id, e.type, e."aggregateType", e."aggregateId", e.payload, e."occurredAt"
        FROM domain_events e
        WHERE (
          (e."aggregateType" = 'Pet' AND e.type = ANY(${PET_TYPES}) AND e."aggregateId" = ANY(${visiblePetIds}))
          OR (e."aggregateType" = 'Booking' AND e.type = ANY(${BOOKING_TYPES}) AND e."aggregateId" IN (SELECT b.id::text FROM bookings b WHERE b."householdId" = ${householdId}::uuid AND b."petId"::text = ANY(${visiblePetIds})))
        )
        ${page ? Prisma.sql`AND (e."occurredAt", e.id) < (${page.at}, ${page.id}::uuid)` : Prisma.empty}
        ORDER BY e."occurredAt" DESC, e.id DESC
        LIMIT ${take * 2}`;
      if (!rows.length) break;
      const bookingPets = await this.bookingPets(rows);
      for (const r of rows) {
        const payload = (r.payload ?? {}) as Record<string, string>;
        const petId = r.aggregateType === "Pet" ? r.aggregateId! : bookingPets.get(r.aggregateId!) ?? payload.petId;
        const def = KINDS[r.type]!;
        const f = petId ? flags.get(petId) : null;
        const allowed = f && f.canViewIdentity && (def.need === "IDENTITY" || (def.need === "HEALTH" && f.canViewHealth) || (def.need === "CARE" && f.canViewCareProfile));
        if (allowed && out.length < take) out.push(this.toEntry(r, def, petId!, payload, pets));
      }
      page = { at: rows[rows.length - 1]!.occurredAt, id: rows[rows.length - 1]!.id };
      if (rows.length < take * 2) { page = null; break; }
    }
    const actorIds = [...new Set(out.map((e) => e.actorUserId).filter((x): x is string => Boolean(x)))];
    const actors = actorIds.length ? await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true } }) : [];
    const last = out[out.length - 1];
    return {
      items: out.map(({ actorUserId, ...e }) => ({ ...e, actor: actorUserId ? { displayName: actors.find((a) => a.id === actorUserId)?.displayName ?? null, isMe: actorUserId === viewerUserId } : null })),
      nextCursor: out.length === take && last ? encodeCursor(new Date(last.occurredAt), last.id) : page ? encodeCursor(page.at, page.id) : null,
    };
  }

  private toEntry(r: Row, def: KindDef, petId: string, payload: Record<string, string>, pets: { id: string; name: string }[]) {
    const actorField = ACTOR_FIELDS.find((k) => typeof payload[k] === "string");
    return {
      id: r.id,
      kind: def.kind,
      messageKey: `activity.${def.kind}`,
      entityType: r.aggregateType === "Booking" ? "Booking" : r.type === "TripCreated" ? "Trip" : r.type === "MedicalDocumentAdded" ? "MedicalDocument" : r.type.startsWith("LostPet") ? "LostPetIncident" : "Pet",
      entityId: r.aggregateType === "Booking" ? r.aggregateId : payload.tripId ?? payload.documentId ?? payload.careItemId ?? payload.incidentId ?? petId,
      petId,
      petName: pets.find((p) => p.id === petId)?.name ?? null,
      occurredAt: r.occurredAt.toISOString(),
      deepLink: def.deepLink({ ...payload, petId }, r.aggregateId ?? ""),
      actorUserId: actorField ? payload[actorField]! : null,
    };
  }

  private async bookingPets(rows: Row[]) {
    const ids = rows.filter((r) => r.aggregateType === "Booking" && r.aggregateId).map((r) => r.aggregateId!);
    const bookings = ids.length ? await this.prisma.booking.findMany({ where: { id: { in: ids } }, select: { id: true, petId: true } }) : [];
    return new Map(bookings.map((b) => [b.id, b.petId]));
  }
}

function encodeCursor(at: Date, id: string) {
  return Buffer.from(`${at.toISOString()}|${id}`).toString("base64url");
}
function decodeCursor(cursor: string): { at: Date; id: string } {
  const [at, id] = Buffer.from(cursor, "base64url").toString().split("|");
  const date = new Date(at ?? "");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || Number.isNaN(date.getTime())) throw new ValidationApiException({ field: "cursor" });
  return { at: date, id };
}
