import { DocumentVisibility, SourceType, type Prisma } from "@prisma/client";
import type { PrismaService } from "../../common/prisma/prisma.service";
import { isGrantActive } from "./pet-access.service";

type QueryClient = PrismaService | Prisma.TransactionClient;

/**
 * The owner's documents ticked for bookings whose grant this user holds right now for this pet. A
 * reassigned, revoked or expired booking grant shares nothing; only health-consented bookings ever store
 * documents (see BookingPetAccessService.grantForBooking). Optionally narrowed to one organisation's
 * bookings or to a single booking.
 */
export async function bookingSharedDocumentIds(
  client: QueryClient,
  petId: string,
  userId: string,
  scope: { organizationId?: string; bookingId?: string } = {},
): Promise<string[]> {
  const links = await client.bookingPetAccess.findMany({
    where: {
      ...(scope.bookingId ? { bookingId: scope.bookingId } : {}),
      healthConsented: true,
      booking: { petId, ...(scope.organizationId ? { providerOrganizationId: scope.organizationId } : {}) },
      petAccessGrant: { is: { userId, petId, revokedAt: null, canViewHealth: true } },
    },
    select: { sharedDocumentIds: true, petAccessGrant: { select: { startsAt: true, expiresAt: true, revokedAt: true } } },
  });
  const now = new Date();
  return [...new Set(links.filter((link) => link.petAccessGrant && isGrantActive(link.petAccessGrant, now)).flatMap((link) => link.sharedDocumentIds))];
}

/**
 * Which of a pet's documents a reader of the household document routes may see. Anyone whose health access
 * comes from the household or from a grant the owner gave sees every document. A provider whose health access
 * comes only from a booking sees what the provider record shows: provider-shared or provider-authored
 * documents, plus exactly the owner documents ticked for one of their active bookings. Returns an empty
 * filter for full access.
 */
export async function documentReadScope(client: QueryClient, petId: string, userId: string): Promise<Prisma.MedicalDocumentWhereInput> {
  const grants = await client.petAccessGrant.findMany({
    where: { petId, userId, canViewHealth: true, revokedAt: null },
    select: { startsAt: true, expiresAt: true, revokedAt: true, reason: true, bookingPetAccess: { select: { id: true } } },
  });
  const now = new Date();
  const householdSide = grants.some((grant) => isGrantActive(grant, now) && !grant.bookingPetAccess && grant.reason !== "EXPLICIT_VET_SHARE" && !grant.reason?.endsWith("_BOOKING"));
  if (householdSide) return {};
  const shared = await bookingSharedDocumentIds(client, petId, userId);
  return {
    voidedAt: null,
    OR: [{ visibility: DocumentVisibility.PROVIDER_SHARED }, { sourceType: SourceType.PROVIDER }, ...(shared.length ? [{ id: { in: shared } }] : [])],
  };
}
