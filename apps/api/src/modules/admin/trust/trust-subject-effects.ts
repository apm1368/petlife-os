import { CommunityContentStatus, LostPetIncidentStatus, LostPetSightingStatus, type Prisma, ProviderReviewStatus, SupportNeedStatus, TrustActionType, TrustSubjectType } from "@prisma/client";
import { TrustActionNotApplicableException, TrustSubjectNotFoundException } from "../../../common/errors/api-exception";

/**
 * Batch 6 — the operational effect of a Trust & Safety action on the Batch 6
 * subjects (community content, support listings, lost-pet incidents and
 * sightings, animal-support organizations). Every effect is a status/flag
 * change on the subject's own model — never a delete — and returns a
 * `{ before, after }` summary that is stored on the TrustAction, so a later
 * RESTORE puts back exactly the prior state (e.g. PARTIALLY_FULFILLED, not a
 * guessed PUBLISHED) and the full history stays readable.
 */
export interface TrustEffect {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  /** Organization suspension also pauses the org's visible listings; their prior statuses are kept here. */
  pausedListings?: { id: string; status: SupportNeedStatus }[];
  restoredByActionId?: string;
}

export const EFFECT_SUBJECTS: TrustSubjectType[] = [
  TrustSubjectType.COMMUNITY_CONTENT,
  TrustSubjectType.SUPPORT_NEED,
  TrustSubjectType.PET_INCIDENT,
  TrustSubjectType.LOST_PET_SIGHTING,
  TrustSubjectType.ANIMAL_SUPPORT_ORGANIZATION,
  TrustSubjectType.REVIEW,
];

/** Community content = a post, a comment or a private chat message (all share CommunityContentStatus). */
async function contentStatus(tx: Prisma.TransactionClient, id: string): Promise<{ kind: "post" | "comment" | "chat"; status: CommunityContentStatus } | null> {
  const post = await tx.communityPost.findUnique({ where: { id }, select: { status: true } });
  if (post) return { kind: "post", status: post.status };
  const comment = await tx.communityComment.findUnique({ where: { id }, select: { status: true } });
  if (comment) return { kind: "comment", status: comment.status };
  const chat = await tx.chatMessage.findUnique({ where: { id }, select: { status: true } });
  return chat ? { kind: "chat", status: chat.status } : null;
}
async function setContentStatus(tx: Prisma.TransactionClient, kind: "post" | "comment" | "chat", id: string, status: CommunityContentStatus) {
  if (kind === "post") await tx.communityPost.update({ where: { id }, data: { status } });
  else if (kind === "comment") await tx.communityComment.update({ where: { id }, data: { status } });
  else await tx.chatMessage.update({ where: { id }, data: { status } });
}

const LISTING_REMOVABLE: SupportNeedStatus[] = [
  SupportNeedStatus.DRAFT,
  SupportNeedStatus.PENDING_REVIEW,
  SupportNeedStatus.PUBLISHED,
  SupportNeedStatus.PARTIALLY_FULFILLED,
  SupportNeedStatus.PAUSED,
  SupportNeedStatus.FULFILLED,
  SupportNeedStatus.REJECTED,
  SupportNeedStatus.EXPIRED,
];
const LISTING_LIVE: SupportNeedStatus[] = [SupportNeedStatus.PUBLISHED, SupportNeedStatus.PARTIALLY_FULFILLED];
const INCIDENT_CLOSABLE: LostPetIncidentStatus[] = [LostPetIncidentStatus.OPEN, LostPetIncidentStatus.SEARCHING, LostPetIncidentStatus.SIGHTING_REPORTED, LostPetIncidentStatus.FOUND, LostPetIncidentStatus.REUNITED];

function notApplicable(subjectType: TrustSubjectType, actionType: TrustActionType, state: unknown): never {
  throw new TrustActionNotApplicableException({ subjectType, actionType, state });
}

/** Applies a non-RESTORE action. Returns null when the action type carries no operational effect for this subject (e.g. WARNING, NO_ACTION). */
export async function applyTrustEffect(tx: Prisma.TransactionClient, subjectType: TrustSubjectType, subjectId: string, actionType: TrustActionType): Promise<TrustEffect | null> {
  switch (subjectType) {
    case TrustSubjectType.COMMUNITY_CONTENT: {
      const next = actionType === TrustActionType.REMOVE_CONTENT ? CommunityContentStatus.REMOVED : actionType === TrustActionType.RESTRICT ? CommunityContentStatus.HIDDEN : null;
      if (!next) return null;
      const c = await contentStatus(tx, subjectId);
      if (!c) throw new TrustSubjectNotFoundException({ subjectType, subjectId });
      if (c.status === next) notApplicable(subjectType, actionType, c.status);
      await setContentStatus(tx, c.kind, subjectId, next);
      return { before: { status: c.status }, after: { status: next } };
    }
    case TrustSubjectType.REVIEW: {
      // A provider review (or its provider reply) reported as abusive/fake: hidden, never deleted.
      if (actionType !== TrustActionType.REMOVE_CONTENT && actionType !== TrustActionType.RESTRICT) return null;
      const r = await tx.providerReview.findUnique({ where: { id: subjectId }, select: { status: true } });
      if (!r) throw new TrustSubjectNotFoundException({ subjectType, subjectId });
      if (r.status === ProviderReviewStatus.HIDDEN) notApplicable(subjectType, actionType, r.status);
      await tx.providerReview.update({ where: { id: subjectId }, data: { status: ProviderReviewStatus.HIDDEN } });
      return { before: { status: r.status }, after: { status: ProviderReviewStatus.HIDDEN } };
    }
    case TrustSubjectType.SUPPORT_NEED: {
      if (actionType !== TrustActionType.REMOVE_CONTENT && actionType !== TrustActionType.RESTRICT) return null;
      const listing = await tx.supportNeedListing.findUnique({ where: { id: subjectId }, select: { status: true } });
      if (!listing) throw new TrustSubjectNotFoundException({ subjectType, subjectId });
      const next = actionType === TrustActionType.REMOVE_CONTENT ? SupportNeedStatus.REMOVED : SupportNeedStatus.PAUSED;
      const allowed = actionType === TrustActionType.REMOVE_CONTENT ? LISTING_REMOVABLE : LISTING_LIVE;
      if (!allowed.includes(listing.status)) notApplicable(subjectType, actionType, listing.status);
      await tx.supportNeedListing.update({ where: { id: subjectId }, data: { status: next } });
      return { before: { status: listing.status }, after: { status: next } };
    }
    case TrustSubjectType.PET_INCIDENT: {
      if (actionType !== TrustActionType.REMOVE_CONTENT) return null;
      const incident = await tx.lostPetIncident.findUnique({ where: { id: subjectId }, select: { status: true, closedAt: true } });
      if (!incident) throw new TrustSubjectNotFoundException({ subjectType, subjectId });
      if (!INCIDENT_CLOSABLE.includes(incident.status)) notApplicable(subjectType, actionType, incident.status);
      // Only the public incident is closed; the pet's own lifecycle is the household's to change.
      await tx.lostPetIncident.update({ where: { id: subjectId }, data: { status: LostPetIncidentStatus.CLOSED, closedAt: new Date() } });
      return { before: { status: incident.status, closedAt: incident.closedAt?.toISOString() ?? null }, after: { status: LostPetIncidentStatus.CLOSED } };
    }
    case TrustSubjectType.LOST_PET_SIGHTING: {
      if (actionType !== TrustActionType.REMOVE_CONTENT) return null;
      const sighting = await tx.lostPetSighting.findUnique({ where: { id: subjectId }, select: { status: true } });
      if (!sighting) throw new TrustSubjectNotFoundException({ subjectType, subjectId });
      if (sighting.status === LostPetSightingStatus.REJECTED) notApplicable(subjectType, actionType, sighting.status);
      await tx.lostPetSighting.update({ where: { id: subjectId }, data: { status: LostPetSightingStatus.REJECTED, reviewedAt: new Date() } });
      return { before: { status: sighting.status }, after: { status: LostPetSightingStatus.REJECTED } };
    }
    case TrustSubjectType.ANIMAL_SUPPORT_ORGANIZATION: {
      const org = await tx.animalSupportOrganization.findUnique({ where: { id: subjectId }, select: { isPubliclyListed: true, verificationStatus: true } });
      if (!org) throw new TrustSubjectNotFoundException({ subjectType, subjectId });
      if (actionType === TrustActionType.REQUIRE_REVERIFICATION) {
        if (org.verificationStatus === "UNDER_REVIEW") notApplicable(subjectType, actionType, org.verificationStatus);
        await tx.animalSupportOrganization.update({ where: { id: subjectId }, data: { verificationStatus: "UNDER_REVIEW" } });
        return { before: { verificationStatus: org.verificationStatus }, after: { verificationStatus: "UNDER_REVIEW" } };
      }
      if (actionType !== TrustActionType.SUSPEND && actionType !== TrustActionType.REMOVE_CONTENT) return null;
      if (!org.isPubliclyListed) notApplicable(subjectType, actionType, { isPubliclyListed: false });
      // Suspension unlists the organization and pauses its live requests so nobody keeps sending help to it.
      const live = await tx.supportNeedListing.findMany({ where: { organizationId: subjectId, status: { in: LISTING_LIVE } }, select: { id: true, status: true } });
      await tx.animalSupportOrganization.update({ where: { id: subjectId }, data: { isPubliclyListed: false } });
      if (live.length) await tx.supportNeedListing.updateMany({ where: { id: { in: live.map((l) => l.id) } }, data: { status: SupportNeedStatus.PAUSED } });
      return { before: { isPubliclyListed: true }, after: { isPubliclyListed: false }, pausedListings: live };
    }
    default:
      return null;
  }
}

/** Reverses `effect` (the most recent unrestored effect on this subject), provided the subject is still in the state that action left it in. */
export async function restoreTrustEffect(tx: Prisma.TransactionClient, subjectType: TrustSubjectType, subjectId: string, effect: TrustEffect): Promise<TrustEffect> {
  const before = effect.before;
  const after = effect.after;
  switch (subjectType) {
    case TrustSubjectType.COMMUNITY_CONTENT: {
      const c = await contentStatus(tx, subjectId);
      if (!c) throw new TrustSubjectNotFoundException({ subjectType, subjectId });
      if (c.status !== after.status) notApplicable(subjectType, TrustActionType.RESTORE, c.status);
      const status = before.status as CommunityContentStatus;
      await setContentStatus(tx, c.kind, subjectId, status);
      return { before: { status: c.status }, after: { status } };
    }
    case TrustSubjectType.REVIEW: {
      const r = await tx.providerReview.findUnique({ where: { id: subjectId }, select: { status: true } });
      if (!r) throw new TrustSubjectNotFoundException({ subjectType, subjectId });
      if (r.status !== after.status) notApplicable(subjectType, TrustActionType.RESTORE, r.status);
      const status = before.status as ProviderReviewStatus;
      await tx.providerReview.update({ where: { id: subjectId }, data: { status } });
      return { before: { status: r.status }, after: { status } };
    }
    case TrustSubjectType.SUPPORT_NEED: {
      const listing = await tx.supportNeedListing.findUnique({ where: { id: subjectId }, select: { status: true } });
      if (!listing) throw new TrustSubjectNotFoundException({ subjectType, subjectId });
      if (listing.status !== after.status) notApplicable(subjectType, TrustActionType.RESTORE, listing.status);
      const status = before.status as SupportNeedStatus;
      await tx.supportNeedListing.update({ where: { id: subjectId }, data: { status } });
      return { before: { status: listing.status }, after: { status } };
    }
    case TrustSubjectType.PET_INCIDENT: {
      const incident = await tx.lostPetIncident.findUnique({ where: { id: subjectId }, select: { status: true } });
      if (!incident) throw new TrustSubjectNotFoundException({ subjectType, subjectId });
      if (incident.status !== after.status) notApplicable(subjectType, TrustActionType.RESTORE, incident.status);
      const status = before.status as LostPetIncidentStatus;
      await tx.lostPetIncident.update({ where: { id: subjectId }, data: { status, closedAt: before.closedAt ? new Date(before.closedAt as string) : null } });
      return { before: { status: incident.status }, after: { status } };
    }
    case TrustSubjectType.LOST_PET_SIGHTING: {
      const sighting = await tx.lostPetSighting.findUnique({ where: { id: subjectId }, select: { status: true } });
      if (!sighting) throw new TrustSubjectNotFoundException({ subjectType, subjectId });
      if (sighting.status !== after.status) notApplicable(subjectType, TrustActionType.RESTORE, sighting.status);
      const status = before.status as LostPetSightingStatus;
      await tx.lostPetSighting.update({ where: { id: subjectId }, data: { status } });
      return { before: { status: sighting.status }, after: { status } };
    }
    case TrustSubjectType.ANIMAL_SUPPORT_ORGANIZATION: {
      const org = await tx.animalSupportOrganization.findUnique({ where: { id: subjectId }, select: { isPubliclyListed: true, verificationStatus: true } });
      if (!org) throw new TrustSubjectNotFoundException({ subjectType, subjectId });
      if ("verificationStatus" in after) {
        if (org.verificationStatus !== after.verificationStatus) notApplicable(subjectType, TrustActionType.RESTORE, org.verificationStatus);
        await tx.animalSupportOrganization.update({ where: { id: subjectId }, data: { verificationStatus: before.verificationStatus as never } });
        return { before: { verificationStatus: org.verificationStatus }, after: { verificationStatus: before.verificationStatus } };
      }
      if (org.isPubliclyListed) notApplicable(subjectType, TrustActionType.RESTORE, { isPubliclyListed: true });
      await tx.animalSupportOrganization.update({ where: { id: subjectId }, data: { isPubliclyListed: true } });
      // Only listings still paused by the suspension go back; anything the org changed since is left alone.
      for (const listing of effect.pausedListings ?? []) {
        await tx.supportNeedListing.updateMany({ where: { id: listing.id, status: SupportNeedStatus.PAUSED }, data: { status: listing.status } });
      }
      return { before: { isPubliclyListed: false }, after: { isPubliclyListed: true }, pausedListings: effect.pausedListings };
    }
    default:
      notApplicable(subjectType, TrustActionType.RESTORE, null);
  }
}
