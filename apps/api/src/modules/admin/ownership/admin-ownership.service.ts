import { Injectable } from "@nestjs/common";
import { PetOwnershipTransferStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { AdminGovernanceRuleException, NotFoundApiException } from "../../../common/errors/api-exception";
import { resolvePagination } from "../../../common/pagination/pagination.dto";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

const INCLUDE = {
  pet: { select: { id: true, name: true, species: true, householdId: true } },
  fromUser: { select: { id: true, displayName: true } },
  toUser: { select: { id: true, displayName: true } },
} satisfies Prisma.PetOwnershipTransferInclude;
type Row = Prisma.PetOwnershipTransferGetPayload<{ include: typeof INCLUDE }>;

export interface AdminOwnershipTransferRow {
  id: string;
  status: PetOwnershipTransferStatus;
  pet: { id: string; name: string; species: string };
  from: { userId: string; name: string };
  to: { userId: string; name: string };
  /** Who the registry says owns the pet right now (the pet never moves on a dispute). */
  registeredOwner: { userId: string; name: string } | null;
  memoryDisposition: string;
  note: string | null;
  createdAt: string;
  respondedAt: string | null;
  appliedAt: string | null;
  expiresAt: string;
  updatedAt: string;
}

/**
 * Admin → Users → Ownership transfers (ID-01/ID-03). Staff see every transfer and every dispute, and close a dispute
 * with a reason once they've checked the parties' documents. Closing never moves the pet: an applied transfer stands
 * (back to ACCEPTED), a pending one is closed (CANCELLED, the registered owner stays) — "opetlife does not judge;
 * the registered owner stays until an official ruling or a written agreement". Both parties are told.
 */
@Injectable()
export class AdminOwnershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditLogService,
    private readonly events: DomainEventsService,
  ) {}

  async list(query: { status?: PetOwnershipTransferStatus; q?: string; page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = resolvePagination({ page: query.page, pageSize: query.pageSize ?? 25 });
    const q = query.q?.trim();
    const where: Prisma.PetOwnershipTransferWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(q
        ? { OR: [{ pet: { name: { contains: q, mode: "insensitive" } } }, { fromUser: { displayName: { contains: q, mode: "insensitive" } } }, { toUser: { displayName: { contains: q, mode: "insensitive" } } }] }
        : {}),
    };
    const [rows, total, disputed] = await Promise.all([
      this.prisma.petOwnershipTransfer.findMany({ where, include: INCLUDE, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip, take }),
      this.prisma.petOwnershipTransfer.count({ where }),
      this.prisma.petOwnershipTransfer.count({ where: { status: PetOwnershipTransferStatus.DISPUTED } }),
    ]);
    return { items: await this.rows(rows), total, page, pageSize, disputed };
  }

  async get(id: string) {
    const row = await this.prisma.petOwnershipTransfer.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new NotFoundApiException("PetOwnershipTransfer");
    const [mapped] = await this.rows([row]);
    return mapped!;
  }

  async closeDispute(admin: ResolvedAdminContext, id: string, reason: string) {
    const row = await this.prisma.petOwnershipTransfer.findUnique({ where: { id } });
    if (!row) throw new NotFoundApiException("PetOwnershipTransfer");
    if (row.status !== PetOwnershipTransferStatus.DISPUTED) throw new AdminGovernanceRuleException({ rule: "OWNERSHIP_NOT_DISPUTED", status: row.status });
    // Closing records the outcome; it never moves the pet.
    const to = row.appliedAt ? PetOwnershipTransferStatus.ACCEPTED : PetOwnershipTransferStatus.CANCELLED;
    const outcome = row.appliedAt ? "TRANSFER_STANDS" : "OWNER_STAYS";
    await this.prisma.$transaction(async (tx) => {
      const done = await tx.petOwnershipTransfer.updateMany({ where: { id, status: PetOwnershipTransferStatus.DISPUTED }, data: { status: to } });
      if (!done.count) throw new AdminGovernanceRuleException({ rule: "OWNERSHIP_CHANGED_CONCURRENTLY" });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "pet_ownership.dispute_closed", entityType: "PetOwnershipTransfer", entityId: id, reason, beforeSummary: { status: row.status }, afterSummary: { status: to, outcome }, tx });
    });
    // Published after commit so the notices go out only for a closure that actually happened.
    await this.events.publish("PetOwnershipDisputeClosed", { transferId: id, petId: row.petId, fromUserId: row.fromUserId, toUserId: row.toUserId, outcome }, { aggregateType: "Pet", aggregateId: row.petId });
    return this.get(id);
  }

  private async rows(rows: Row[]): Promise<AdminOwnershipTransferRow[]> {
    const owners = rows.length
      ? await this.prisma.petOwnership.findMany({ where: { petId: { in: [...new Set(rows.map((r) => r.petId))] } }, select: { petId: true, owner: { select: { id: true, displayName: true } } } })
      : [];
    const ownerOf = new Map(owners.map((o) => [o.petId, o.owner]));
    return rows.map((r) => {
      const owner = ownerOf.get(r.petId);
      return {
        id: r.id,
        status: r.status,
        pet: { id: r.pet.id, name: r.pet.name, species: r.pet.species },
        from: { userId: r.fromUser.id, name: r.fromUser.displayName },
        to: { userId: r.toUser.id, name: r.toUser.displayName },
        registeredOwner: owner ? { userId: owner.id, name: owner.displayName } : null,
        memoryDisposition: r.memoryDisposition,
        note: r.note,
        createdAt: r.createdAt.toISOString(),
        respondedAt: r.respondedAt?.toISOString() ?? null,
        appliedAt: r.appliedAt?.toISOString() ?? null,
        expiresAt: r.expiresAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    });
  }
}
