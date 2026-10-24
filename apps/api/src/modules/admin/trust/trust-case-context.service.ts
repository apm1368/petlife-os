import { Injectable } from "@nestjs/common";
import { type Prisma, TrustActionType, TrustSubjectType } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { TrustCaseNotFoundException } from "../../../common/errors/api-exception";

/** Which actions have a real operational effect per subject — the case view offers only these (plus WARNING / NO_ACTION, which record a decision without changing the subject). */
const EFFECTIVE_ACTIONS: Partial<Record<TrustSubjectType, TrustActionType[]>> = {
  [TrustSubjectType.COMMUNITY_CONTENT]: [TrustActionType.REMOVE_CONTENT, TrustActionType.RESTRICT, TrustActionType.RESTORE],
  [TrustSubjectType.SUPPORT_NEED]: [TrustActionType.REMOVE_CONTENT, TrustActionType.RESTRICT, TrustActionType.RESTORE],
  [TrustSubjectType.PET_INCIDENT]: [TrustActionType.REMOVE_CONTENT, TrustActionType.RESTORE],
  [TrustSubjectType.LOST_PET_SIGHTING]: [TrustActionType.REMOVE_CONTENT, TrustActionType.RESTORE],
  [TrustSubjectType.ANIMAL_SUPPORT_ORGANIZATION]: [TrustActionType.SUSPEND, TrustActionType.REQUIRE_REVERIFICATION, TrustActionType.RESTORE],
  [TrustSubjectType.PROVIDER]: [TrustActionType.SUSPEND, TrustActionType.REQUIRE_REVERIFICATION, TrustActionType.RESTORE],
  [TrustSubjectType.SELLER]: [TrustActionType.SUSPEND, TrustActionType.RESTRICT, TrustActionType.REQUIRE_REVERIFICATION, TrustActionType.RESTORE],
};

function reportWhere(subjectType: TrustSubjectType, subjectId: string): Prisma.CommunityReportWhereInput | null {
  switch (subjectType) {
    case TrustSubjectType.COMMUNITY_CONTENT:
      return { OR: [{ postId: subjectId }, { commentId: subjectId }] };
    case TrustSubjectType.SUPPORT_NEED:
      return { supportNeedListingId: subjectId };
    case TrustSubjectType.PET_INCIDENT:
      return { lostPetIncidentId: subjectId };
    case TrustSubjectType.LOST_PET_SIGHTING:
      return { lostPetSightingId: subjectId };
    case TrustSubjectType.ANIMAL_SUPPORT_ORGANIZATION:
      return { organizationId: subjectId };
    default:
      return null;
  }
}

const excerpt = (text: string | null | undefined, max = 280) => (text && text.length > max ? `${text.slice(0, max)}…` : text ?? null);

/**
 * Batch 6 — everything a moderator needs on one case: what the subject is and
 * its current state, who owns it (by display name / organization — never
 * contact details or exact locations), every report on it, and the actions
 * that have a real effect. Reporter identities are deliberately not returned;
 * a moderator sees how many distinct people reported, not who.
 */
@Injectable()
export class TrustCaseContextService {
  constructor(private readonly prisma: PrismaService) {}

  async get(trustCaseId: string) {
    const trustCase = await this.prisma.trustCase.findUnique({ where: { id: trustCaseId }, select: { id: true, subjectType: true, subjectId: true } });
    if (!trustCase) throw new TrustCaseNotFoundException({ trustCaseId });
    const { subjectType, subjectId } = trustCase;

    const where = reportWhere(subjectType, subjectId);
    const reports = where ? await this.prisma.communityReport.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 }) : [];
    const reasons: Record<string, number> = {};
    for (const r of reports) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;

    return {
      trustCaseId,
      subjectType,
      subjectId,
      subject: await this.subjectSummary(subjectType, subjectId),
      reports: {
        total: reports.length,
        distinctReporters: new Set(reports.map((r) => r.reporterUserId)).size,
        byReason: reasons,
        items: reports.map((r) => ({ id: r.id, reason: r.reason, details: r.details, status: r.status, trustCaseId: r.trustCaseId, createdAt: r.createdAt.toISOString() })),
      },
      availableActions: [TrustActionType.WARNING, ...(EFFECTIVE_ACTIONS[subjectType] ?? []), TrustActionType.NO_ACTION],
    };
  }

  private async displayName(userId: string | null | undefined) {
    if (!userId) return null;
    return (await this.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } }))?.displayName ?? null;
  }

  private async subjectSummary(subjectType: TrustSubjectType, id: string): Promise<Record<string, unknown> | null> {
    switch (subjectType) {
      case TrustSubjectType.COMMUNITY_CONTENT: {
        const post = await this.prisma.communityPost.findUnique({ where: { id } });
        if (post) return { kind: "POST", title: post.title, text: excerpt(post.body), status: post.status, owner: await this.displayName(post.authorUserId), createdAt: post.createdAt.toISOString(), link: `/community/posts/${post.id}` };
        const comment = await this.prisma.communityComment.findUnique({ where: { id } });
        return comment ? { kind: "COMMENT", text: excerpt(comment.body), status: comment.status, owner: await this.displayName(comment.authorUserId), createdAt: comment.createdAt.toISOString(), link: `/community/posts/${comment.postId}` } : null;
      }
      case TrustSubjectType.SUPPORT_NEED: {
        const l = await this.prisma.supportNeedListing.findUnique({ where: { id }, include: { organization: { select: { id: true, name: true, verificationStatus: true } } } });
        return l
          ? { kind: "SUPPORT_NEED", title: l.title, text: excerpt(l.description), status: l.status, category: l.category, city: l.city, owner: await this.displayName(l.creatorUserId), organization: l.organization, createdAt: l.createdAt.toISOString(), link: `/animal-support/needs/${l.id}` }
          : null;
      }
      case TrustSubjectType.PET_INCIDENT: {
        const i = await this.prisma.lostPetIncident.findUnique({ where: { id }, include: { pet: { select: { name: true, species: true } } } });
        return i ? { kind: "LOST_PET_INCIDENT", title: i.pet.name, species: i.pet.species, text: excerpt(i.description), status: i.status, area: i.publicArea, owner: await this.displayName(i.createdByUserId), createdAt: i.createdAt.toISOString(), link: `/lost-pets/${i.id}` } : null;
      }
      case TrustSubjectType.LOST_PET_SIGHTING: {
        const s = await this.prisma.lostPetSighting.findUnique({ where: { id } });
        return s ? { kind: "LOST_PET_SIGHTING", text: excerpt(s.description), status: s.status, incidentId: s.incidentId, reportedByMember: !!s.reporterUserId, createdAt: s.createdAt.toISOString() } : null;
      }
      case TrustSubjectType.ANIMAL_SUPPORT_ORGANIZATION: {
        const o = await this.prisma.animalSupportOrganization.findUnique({ where: { id } });
        if (!o) return null;
        const [members, liveListings] = await Promise.all([
          this.prisma.animalSupportOrgMembership.count({ where: { organizationId: id, isActive: true } }),
          this.prisma.supportNeedListing.count({ where: { organizationId: id, status: { in: ["PUBLISHED", "PARTIALLY_FULFILLED", "PAUSED"] } } }),
        ]);
        return { kind: "ORGANIZATION", title: o.name, status: o.verificationStatus, isPubliclyListed: o.isPubliclyListed, type: o.type, members, liveListings, createdAt: o.createdAt.toISOString(), link: `/animal-support/organizations/${o.id}` };
      }
      default:
        return null;
    }
  }
}
