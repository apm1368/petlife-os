import type { CommunityComment, CommunityPost, CommunityReport, Pet } from "@prisma/client";
import type { CommunityCommentDto, CommunityPostDto, CommunityPostPetRefDto, CommunityReactionType, CommunityReportDto } from "@petlife/types";
import { resolveObjectUrls } from "../storage/object-url.util";

type PostWithRelations = CommunityPost & {
  pet: Pet | null;
  _count: { comments: number; reactions: number };
};

/** authorUserId carries no Prisma relation (see the actor-reference convention) — authorDisplayName is always resolved by the caller via a manual User lookup, mirroring DonationService.listPublicDonors' own batch-join pattern. */
/**
 * Batch 6 privacy: community content is public, so the author's account id is
 * only returned to the author themself (`isMine`) and the name is reduced to
 * the first given name — the full account name is never shown to strangers.
 */
export function publicAuthorName(displayName: string | undefined): string {
  return (displayName ?? "").trim().split(/\s+/)[0] ?? "";
}

export function toCommunityPostDto(row: PostWithRelations, authorDisplayName: string, viewerReaction: CommunityReactionType | null, viewerUserId?: string): CommunityPostDto {
  const isMine = !!viewerUserId && viewerUserId === row.authorUserId;
  return {
    id: row.id,
    authorUserId: isMine ? row.authorUserId : null,
    isMine,
    authorDisplayName: publicAuthorName(authorDisplayName),
    type: row.type as unknown as CommunityPostDto["type"],
    title: row.title,
    body: row.body,
    locale: row.locale as unknown as CommunityPostDto["locale"],
    countryCode: row.countryCode,
    pet: row.pet ? ({ name: row.pet.name, species: row.pet.species as unknown as CommunityPostPetRefDto["species"], photoUrl: row.pet.photoUrl } satisfies CommunityPostPetRefDto) : null,
    mediaObjectKeys: row.mediaObjectKeys,
    mediaUrls: resolveObjectUrls(row.mediaObjectKeys),
    status: row.status as unknown as CommunityPostDto["status"],
    sourceType: row.sourceType as unknown as CommunityPostDto["sourceType"],
    sourceLostPetIncidentId: row.sourceLostPetIncidentId,
    sourceSupportCampaignId: row.sourceSupportCampaignId,
    topics: row.topics,
    city: row.city,
    commentCount: row._count.comments,
    reactionCount: row._count.reactions,
    viewerReaction,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toCommunityCommentDto(row: CommunityComment, authorDisplayName: string, viewerUserId?: string): CommunityCommentDto {
  const isMine = !!viewerUserId && viewerUserId === row.authorUserId;
  return {
    id: row.id,
    postId: row.postId,
    authorUserId: isMine ? row.authorUserId : null,
    isMine,
    authorDisplayName: publicAuthorName(authorDisplayName),
    body: row.body,
    status: row.status as unknown as CommunityCommentDto["status"],
    parentCommentId: row.parentCommentId,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toCommunityReportDto(row: CommunityReport): CommunityReportDto {
  return {
    id: row.id,
    postId: row.postId,
    commentId: row.commentId,
    supportNeedListingId: row.supportNeedListingId,
    lostPetIncidentId: row.lostPetIncidentId,
    lostPetSightingId: row.lostPetSightingId,
    organizationId: row.organizationId,
    reason: row.reason as unknown as CommunityReportDto["reason"],
    details: row.details,
    status: row.status as unknown as CommunityReportDto["status"],
    trustCaseId: row.trustCaseId,
    createdAt: row.createdAt.toISOString(),
  };
}
