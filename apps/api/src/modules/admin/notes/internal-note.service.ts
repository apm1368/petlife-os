import { Injectable } from "@nestjs/common";
import { InternalNoteEntityType } from "@prisma/client";
import type { InternalNoteDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

/**
 * The one write/read path for `internal_notes` — polymorphic across every
 * entity type that can carry an internal note (spec: "one table for every
 * CRM entity that can carry internal notes, not one table per entity
 * type"), reused by Support Cases, Disputes, and Trust Cases alike rather
 * than each building its own notes sub-feature. Append-only by convention:
 * there is no update/delete method here on purpose (spec: "do not allow
 * silent deletion without audit").
 */
@Injectable()
export class InternalNoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  async add(admin: ResolvedAdminContext, entityType: InternalNoteEntityType, entityId: string, body: string, requestId?: string): Promise<InternalNoteDto> {
    const note = await this.prisma.$transaction(async (tx) => {
      const created = await tx.internalNote.create({
        data: { entityType, entityId, authorAdminId: admin.adminUserId, body },
        include: { authorAdmin: { include: { user: true } } },
      });
      await this.events.publish("InternalNoteAdded", { noteId: created.id, entityType, entityId, authorAdminId: admin.adminUserId }, { tx, aggregateType: entityType, aggregateId: entityId });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "internal_note.added", entityType, entityId, requestId, tx });
      return created;
    });

    return {
      id: note.id,
      entityType: note.entityType as never,
      entityId: note.entityId,
      author: { id: note.authorAdmin.id, displayName: note.authorAdmin.user.displayName, role: note.authorAdmin.role as never },
      body: note.body,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt ? note.updatedAt.toISOString() : null,
    };
  }

  async listForEntity(entityType: InternalNoteEntityType, entityId: string): Promise<InternalNoteDto[]> {
    const notes = await this.prisma.internalNote.findMany({
      where: { entityType, entityId },
      include: { authorAdmin: { include: { user: true } } },
      orderBy: { createdAt: "desc" },
    });
    return notes.map((n) => ({
      id: n.id,
      entityType: n.entityType as never,
      entityId: n.entityId,
      author: { id: n.authorAdmin.id, displayName: n.authorAdmin.user.displayName, role: n.authorAdmin.role as never },
      body: n.body,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt ? n.updatedAt.toISOString() : null,
    }));
  }
}
