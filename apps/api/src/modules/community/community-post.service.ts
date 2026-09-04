import { Injectable } from "@nestjs/common";
import { CommunityContentStatus, CommunityPostType, CommunitySourceType, Prisma } from "@prisma/client";
import type { CommunityReactionType as DtoReactionType } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { StorageService } from "../storage/storage.service";
import { PetAccessService } from "../pet-access/pet-access.service";
import { CommunityCommentNotFoundException, CommunityContentNotVisibleException, CommunityPostNotFoundException, PetAccessDeniedException } from "../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto, type PaginationQueryDto } from "../../common/pagination/pagination.dto";
import { toCommunityCommentDto, toCommunityPostDto } from "./community-mapper";
import type { CreateCommunityCommentDto, CreateCommunityPostDto, ListCommunityPostsQueryDto, SetCommunityReactionDto } from "./dto/community.dto";

const POST_INCLUDE = { pet: true, _count: { select: { comments: true, reactions: true } } } satisfies Prisma.CommunityPostInclude;

/**
 * Consumer-facing Community core (spec: "a useful PET LIFE OS Community...
 * NOT generic social media"). Browsing is public; every mutation here is
 * called only from routes behind SessionAuthGuard (spec: "Creating: post,
 * comment, reaction, report — requires authentication"). `authorUserId`/
 * `reporterUserId`-style actor fields carry no Prisma relation (the
 * established actor-reference convention), so display names are always
 * resolved via a manual batch User lookup, mirroring
 * DonationService.listPublicDonors.
 */
@Injectable()
export class CommunityPostService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly storage: StorageService,
    private readonly petAccess: PetAccessService,
  ) {}

  private async displayNameMap(userIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(userIds)];
    if (!unique.length) return new Map();
    const users = await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, displayName: true } });
    return new Map(users.map((u) => [u.id, u.displayName]));
  }

  private async getVisiblePostOrThrow(postId: string) {
    const row = await this.prisma.communityPost.findUnique({ where: { id: postId }, include: POST_INCLUDE });
    if (!row) throw new CommunityPostNotFoundException({ postId });
    if (row.status !== CommunityContentStatus.PUBLISHED) throw new CommunityContentNotVisibleException({ postId });
    return row;
  }

  async create(authorUserId: string, dto: CreateCommunityPostDto) {
    if (dto.petId) {
      const allowed = await this.petAccess.hasActiveAccess(dto.petId, authorUserId);
      if (!allowed) throw new PetAccessDeniedException({ petId: dto.petId });
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.communityPost.create({
        data: {
          authorUserId,
          type: dto.type,
          title: dto.title,
          body: dto.body,
          petId: dto.petId,
          mediaObjectKeys: dto.mediaObjectKeys ?? [],
        },
        include: POST_INCLUDE,
      });
      await this.events.publish("CommunityPostCreated", { postId: created.id, authorUserId, type: created.type }, { tx, aggregateType: "CommunityPost", aggregateId: created.id });
      return created;
    });
    const names = await this.displayNameMap([authorUserId]);
    return toCommunityPostDto(row, names.get(authorUserId) ?? "", null);
  }

  /**
   * spec: "Lost Pet incident may optionally generate/share a community
   * post... Rescue campaigns may be shared into community. Again: Campaign
   * remains source of truth. Post is only presentation/distribution." The
   * caller (LostPetIncidentService.shareToCommunity / SupportCampaignService.
   * shareToCommunity) has already verified the incident/campaign is real and
   * the actor is authorized to share it — this method only ever creates the
   * distribution post, never anything that could close or mutate the
   * source. `sourceType` is USER-distinct precisely so a later "delete this
   * post" never reaches back into LostPetIncident/SupportCampaign at all
   * (there is no such reverse code path anywhere in this service).
   */
  async createSourcedPost(authorUserId: string, input: {
    type: CommunityPostType;
    title?: string;
    body: string;
    petId?: string;
    mediaObjectKeys?: string[];
    sourceType: CommunitySourceType;
    sourceLostPetIncidentId?: string;
    sourceSupportCampaignId?: string;
  }) {
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.communityPost.create({
        data: {
          authorUserId,
          type: input.type,
          title: input.title,
          body: input.body,
          petId: input.petId,
          mediaObjectKeys: input.mediaObjectKeys ?? [],
          sourceType: input.sourceType,
          sourceLostPetIncidentId: input.sourceLostPetIncidentId,
          sourceSupportCampaignId: input.sourceSupportCampaignId,
        },
        include: POST_INCLUDE,
      });
      await this.events.publish("CommunityPostCreated", { postId: created.id, authorUserId, type: created.type, sourceType: input.sourceType }, { tx, aggregateType: "CommunityPost", aggregateId: created.id });
      return created;
    });
    const names = await this.displayNameMap([authorUserId]);
    return toCommunityPostDto(row, names.get(authorUserId) ?? "", null);
  }

  async list(query: ListCommunityPostsQueryDto, viewerUserId?: string) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.CommunityPostWhereInput = { status: CommunityContentStatus.PUBLISHED, type: query.type, countryCode: query.countryCode };
    const [rows, total] = await Promise.all([
      this.prisma.communityPost.findMany({ where, include: POST_INCLUDE, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.communityPost.count({ where }),
    ]);

    const names = await this.displayNameMap(rows.map((r) => r.authorUserId));
    const viewerReactions = viewerUserId
      ? new Map(
          (await this.prisma.communityReaction.findMany({ where: { userId: viewerUserId, postId: { in: rows.map((r) => r.id) } }, select: { postId: true, type: true } })).map((r) => [
            r.postId,
            r.type as unknown as DtoReactionType,
          ]),
        )
      : new Map<string, DtoReactionType>();

    const items = rows.map((row) => toCommunityPostDto(row, names.get(row.authorUserId) ?? "", viewerReactions.get(row.id) ?? null));
    return toPaginatedDto(items, total, page, pageSize);
  }

  async get(postId: string, viewerUserId?: string) {
    const row = await this.getVisiblePostOrThrow(postId);
    const names = await this.displayNameMap([row.authorUserId]);
    const viewerReaction = viewerUserId ? await this.prisma.communityReaction.findUnique({ where: { postId_userId: { postId, userId: viewerUserId } } }) : null;
    return toCommunityPostDto(row, names.get(row.authorUserId) ?? "", (viewerReaction?.type as unknown as DtoReactionType) ?? null);
  }

  async addComment(postId: string, authorUserId: string, dto: CreateCommunityCommentDto) {
    await this.getVisiblePostOrThrow(postId);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.communityComment.create({ data: { postId, authorUserId, body: dto.body } });
      await this.events.publish("CommunityCommentAdded", { postId, commentId: created.id, authorUserId }, { tx, aggregateType: "CommunityPost", aggregateId: postId });
      return created;
    });
    const names = await this.displayNameMap([authorUserId]);
    return toCommunityCommentDto(row, names.get(authorUserId) ?? "");
  }

  async listComments(postId: string, query: PaginationQueryDto) {
    await this.getVisiblePostOrThrow(postId);
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.CommunityCommentWhereInput = { postId, status: CommunityContentStatus.PUBLISHED };
    const [rows, total] = await Promise.all([
      this.prisma.communityComment.findMany({ where, orderBy: { createdAt: "asc" }, skip, take }),
      this.prisma.communityComment.count({ where }),
    ]);
    const names = await this.displayNameMap(rows.map((r) => r.authorUserId));
    return toPaginatedDto(
      rows.map((row) => toCommunityCommentDto(row, names.get(row.authorUserId) ?? "")),
      total,
      page,
      pageSize,
    );
  }

  /** spec's "concurrent: duplicate reaction" — CommunityReaction's own `@@unique([postId, userId])` makes upsert the entire concurrency guard, no application-level locking needed. */
  async setReaction(postId: string, userId: string, dto: SetCommunityReactionDto) {
    await this.getVisiblePostOrThrow(postId);
    await this.prisma.communityReaction.upsert({
      where: { postId_userId: { postId, userId } },
      create: { postId, userId, type: dto.type },
      update: { type: dto.type },
    });
  }

  async removeReaction(postId: string, userId: string): Promise<void> {
    await this.prisma.communityReaction.deleteMany({ where: { postId, userId } });
  }

  async requestMediaUpload(userId: string, contentType: string, fileSizeBytes: number) {
    return this.storage.createCommunityMediaUploadTarget(userId, contentType, fileSizeBytes);
  }

  async getCommentOrThrow(commentId: string) {
    const row = await this.prisma.communityComment.findUnique({ where: { id: commentId } });
    if (!row) throw new CommunityCommentNotFoundException({ commentId });
    return row;
  }

  async getPostOrThrow(postId: string) {
    const row = await this.prisma.communityPost.findUnique({ where: { id: postId } });
    if (!row) throw new CommunityPostNotFoundException({ postId });
    return row;
  }
}
