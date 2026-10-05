import { Injectable } from "@nestjs/common";
import { AnimalSupportOrgRole, AppealStatus, Prisma, ProviderUserRole, TrustActionType, TrustSubjectType } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";

const APPEAL_WINDOW_MS = 30 * 86400e3;
const NOT_APPEALABLE: TrustActionType[] = [TrustActionType.NO_ACTION, TrustActionType.RESTORE];

/**
 * The member's side of moderation: decisions that affected them (their account, their community content, their
 * support needs, organisations or provider businesses they own), and their own appeals. Filing an appeal never
 * reverses anything — an admin decides (existing /admin/trust/appeals/:id). Withdrawal is possible only before
 * review starts. Everyone else's decisions look like missing ones (404).
 */
@Injectable()
export class MemberAppealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  /** Subject ids the member answers for, per subject type. */
  private async subjectsOf(userId: string): Promise<Prisma.TrustCaseWhereInput[]> {
    const [posts, comments, needs, orgs, providers] = await Promise.all([
      this.prisma.communityPost.findMany({ where: { authorUserId: userId }, select: { id: true }, take: 2000 }),
      this.prisma.communityComment.findMany({ where: { authorUserId: userId }, select: { id: true }, take: 2000 }),
      this.prisma.supportNeedListing.findMany({ where: { creatorUserId: userId }, select: { id: true }, take: 2000 }),
      this.prisma.animalSupportOrgMembership.findMany({ where: { userId, isActive: true, role: AnimalSupportOrgRole.OWNER }, select: { organizationId: true } }),
      this.prisma.providerUser.findMany({ where: { userId, removedAt: null, role: ProviderUserRole.OWNER }, select: { providerOrganizationId: true } }),
    ]);
    return [
      { subjectType: TrustSubjectType.USER, subjectId: userId },
      { subjectType: TrustSubjectType.COMMUNITY_CONTENT, subjectId: { in: [...posts, ...comments].map((x) => x.id) } },
      { subjectType: TrustSubjectType.SUPPORT_NEED, subjectId: { in: needs.map((x) => x.id) } },
      { subjectType: TrustSubjectType.ANIMAL_SUPPORT_ORGANIZATION, subjectId: { in: orgs.map((x) => x.organizationId) } },
      { subjectType: TrustSubjectType.PROVIDER, subjectId: { in: providers.map((x) => x.providerOrganizationId) } },
    ];
  }

  async decisions(userId: string) {
    const actions = await this.prisma.trustAction.findMany({
      where: { actionType: { notIn: NOT_APPEALABLE }, trustCase: { OR: await this.subjectsOf(userId) } },
      include: { trustCase: { select: { subjectType: true, subjectId: true } }, appeal: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const now = Date.now();
    return actions.map((a) => ({
      actionId: a.id,
      actionType: a.actionType,
      subjectType: a.trustCase.subjectType,
      subjectId: a.trustCase.subjectId,
      reason: a.reason,
      decidedAt: a.createdAt.toISOString(),
      appealDeadline: new Date(a.createdAt.getTime() + APPEAL_WINDOW_MS).toISOString(),
      canAppeal: !a.appeal && now - a.createdAt.getTime() <= APPEAL_WINDOW_MS,
      appeal: a.appeal && a.appeal.appellantUserId === userId ? toAppeal(a.appeal) : a.appeal ? { status: a.appeal.status } : null,
    }));
  }

  async submit(userId: string, actionId: string, reason: string) {
    const action = await this.prisma.trustAction.findFirst({ where: { id: actionId, actionType: { notIn: NOT_APPEALABLE }, trustCase: { OR: await this.subjectsOf(userId) } }, include: { appeal: true } });
    if (!action) throw new NotFoundApiException("ModerationDecision");
    if (action.appeal) throw new ValidationApiException({ field: "actionId", reason: "ALREADY_APPEALED" });
    if (Date.now() - action.createdAt.getTime() > APPEAL_WINDOW_MS) throw new ValidationApiException({ field: "actionId", reason: "APPEAL_WINDOW_CLOSED" });
    const text = reason.trim();
    if (!text) throw new ValidationApiException({ field: "reason" });
    try {
      const appeal = await this.prisma.$transaction(async (tx) => {
        const created = await tx.appeal.create({ data: { trustActionId: actionId, appellantUserId: userId, reason: text } });
        await this.events.publish("AppealSubmitted", { appealId: created.id, trustActionId: actionId, byMember: true }, { tx, aggregateType: "Appeal", aggregateId: created.id });
        return created;
      });
      return toAppeal(appeal);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ValidationApiException({ field: "actionId", reason: "ALREADY_APPEALED" });
      throw e;
    }
  }

  async mine(userId: string) {
    const rows = await this.prisma.appeal.findMany({ where: { appellantUserId: userId }, orderBy: { createdAt: "desc" }, take: 100 });
    return rows.map(toAppeal);
  }

  async withdraw(userId: string, appealId: string) {
    const done = await this.prisma.appeal.updateMany({ where: { id: appealId, appellantUserId: userId, status: AppealStatus.SUBMITTED }, data: { status: AppealStatus.WITHDRAWN, resolvedAt: new Date() } });
    if (!done.count) {
      const row = await this.prisma.appeal.findFirst({ where: { id: appealId, appellantUserId: userId } });
      if (!row) throw new NotFoundApiException("Appeal");
      throw new ValidationApiException({ field: "appealId", reason: "NOT_WITHDRAWABLE", status: row.status });
    }
    return toAppeal(await this.prisma.appeal.findUniqueOrThrow({ where: { id: appealId } }));
  }
}

/** Member-facing status names: OVERTURNED → APPROVED, UPHELD → REJECTED; the admin's resolution text is shown. */
function toAppeal(a: Prisma.AppealGetPayload<object>) {
  const status = a.status === "OVERTURNED" || a.status === "PARTIALLY_OVERTURNED" ? "APPROVED" : a.status === "UPHELD" ? "REJECTED" : a.status;
  return { id: a.id, actionId: a.trustActionId, status, partial: a.status === "PARTIALLY_OVERTURNED", reason: a.reason, resolution: a.resolution, submittedAt: a.createdAt.toISOString(), resolvedAt: a.resolvedAt?.toISOString() ?? null };
}
