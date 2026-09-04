import type { CommunityComment, CommunityPost, CommunityReport, Pet } from "@prisma/client";
import type { CommunityCommentDto, CommunityPostDto, CommunityPostPetRefDto, CommunityReactionType, CommunityReportDto } from "@petlife/types";
import { resolveObjectUrls } from "../storage/object-url.util";

type PostWithRelations = CommunityPost & {
  pet: Pet | null;
  _count: { comments: number; reactions: number };
};

/** authorUserId carries no Prisma relation (see the actor-reference convention) — authorDisplayName is always resolved by the caller via a manual User lookup, mirroring DonationService.listPublicDonors' own batch-join pattern. */
export function toCommunityPostDto(row: PostWithRelations, authorDisplayName: string, viewerReaction: CommunityReactionType | null): CommunityPostDto {
  return {
    id: row.id,
    authorUserId: row.authorUserId,
    authorDisplayName,
    type: row.type as unknown as CommunityPostDto["type"],
    title: row.title,
    body: row.body,
    locale: row.locale as unknown as CommunityPostDto["locale"],
    countryCode: row.countryCode,
    pet: row.pet ? ({ id: row.pet.id, name: row.pet.name, species: row.pet.species as unknown as CommunityPostPetRefDto["species"], photoUrl: row.pet.photoUrl } satisfies CommunityPostPetRefDto) : null,
    mediaObjectKeys: row.mediaObjectKeys,
    mediaUrls: resolveObjectUrls(row.mediaObjectKeys),
    status: row.status as unknown as CommunityPostDto["status"],
    sourceType: row.sourceType as unknown as CommunityPostDto["sourceType"],
    sourceLostPetIncidentId: row.sourceLostPetIncidentId,
    sourceSupportCampaignId: row.sourceSupportCampaignId,
    commentCount: row._count.comments,
    reactionCount: row._count.reactions,
    viewerReaction,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toCommunityCommentDto(row: CommunityComment, authorDisplayName: string): CommunityCommentDto {
  return {
    id: row.id,
    postId: row.postId,
    authorUserId: row.authorUserId,
    authorDisplayName,
    body: row.body,
    status: row.status as unknown as CommunityCommentDto["status"],
    createdAt: row.createdAt.toISOString(),
  };
}

export function toCommunityReportDto(row: CommunityReport): CommunityReportDto {
  return {
    id: row.id,
    postId: row.postId,
    commentId: row.commentId,
    reason: row.reason as unknown as CommunityReportDto["reason"],
    details: row.details,
    status: row.status as unknown as CommunityReportDto["status"],
    trustCaseId: row.trustCaseId,
    createdAt: row.createdAt.toISOString(),
  };
}
