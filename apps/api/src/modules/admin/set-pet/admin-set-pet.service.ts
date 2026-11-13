import { Injectable, Logger } from "@nestjs/common";
import { NotificationCategory, Prisma, SetPetActor, SetPetDesignFileStatus, SetPetRequestStatus } from "@prisma/client";
import type { AdminSetPetDetailDto, AdminSetPetListDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { NotFoundApiException, ValidationApiException } from "../../../common/errors/api-exception";
import { StorageService } from "../../storage/storage.service";
import { NotificationOrchestratorService } from "../../notifications/notification-orchestrator.service";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

const S = SetPetRequestStatus;
const PAGE_SIZE = 30;

/**
 * What staff may do to a request. Quoting is its own action (SUBMITTED or QUOTED → QUOTED); confirming a quote is the
 * member's, never staff's; SHIPPED and CANCELLED are final.
 */
export const SET_PET_STAFF_TRANSITIONS: Record<SetPetRequestStatus, SetPetRequestStatus[]> = {
  [S.SUBMITTED]: [S.CANCELLED],
  [S.QUOTED]: [S.CANCELLED],
  [S.CONFIRMED]: [S.IN_PRODUCTION, S.CANCELLED],
  [S.IN_PRODUCTION]: [S.SHIPPED],
  [S.SHIPPED]: [],
  [S.CANCELLED]: [],
};

/** SP-000123: the reference members and staff read aloud. */
export const setPetNumber = (n: number) => `SP-${String(n).padStart(6, "0")}`;

/**
 * Design files leave only as downloads: previewable images keep their type, anything else (SVG, PDF, AI, PSD, HEIC)
 * goes out as application/octet-stream, so a file that can carry script is never rendered inline.
 */
export function setPetDesignDownload(file: { objectKey: string; originalFilename: string | null; mimeType: string; previewable: boolean }) {
  const ext = (/\.([a-z0-9]{1,8})$/i.exec(file.objectKey)?.[1] ?? "bin").toLowerCase();
  return { filename: file.originalFilename?.trim() || `design.${ext}`, contentType: file.previewable ? file.mimeType : "application/octet-stream" };
}

const num = (d: Prisma.Decimal | null) => (d === null ? null : Number(d));

/**
 * Admin side of «ست پت» (owner, 2026-11-13). Staff read every request, quote it, move it through production and
 * shipping or cancel it; each change is one timeline row (the member reads the same timeline), one audit row, and a
 * notification to the member. Design files are private and open only through an audited, reasoned download.
 */
@Injectable()
export class AdminSetPetService {
  private readonly logger = new Logger(AdminSetPetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditLogService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationOrchestratorService,
  ) {}

  async list(query: { status?: SetPetRequestStatus; q?: string; page?: number }): Promise<AdminSetPetListDto> {
    const page = Math.max(1, query.page ?? 1);
    const q = query.q?.trim();
    const numberMatch = q ? /^(?:SP-?)?0*(\d{1,9})$/i.exec(q) : null;
    const search: Prisma.SetPetRequestWhereInput = q
      ? numberMatch
        ? { number: Number(numberMatch[1]) }
        : { user: { displayName: { contains: q, mode: "insensitive" } } }
      : {};
    const where: Prisma.SetPetRequestWhereInput = { ...search, ...(query.status ? { status: query.status } : {}) };
    const [rows, total, groups] = await Promise.all([
      this.prisma.setPetRequest.findMany({
        where,
        // Oldest waiting first, so nobody's request sits at the bottom of the queue.
        orderBy: [{ createdAt: query.status === S.SUBMITTED ? "asc" : "desc" }, { id: "asc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { user: { select: { displayName: true } }, pet: { select: { name: true, species: true } }, _count: { select: { placements: true, designs: true } } },
      }),
      this.prisma.setPetRequest.count({ where }),
      this.prisma.setPetRequest.groupBy({ by: ["status"], where: search, _count: { _all: true } }),
    ]);
    const counts = Object.fromEntries(Object.values(S).map((s) => [s, groups.find((g) => g.status === s)?._count._all ?? 0])) as Record<SetPetRequestStatus, number>;
    return {
      items: rows.map((r) => ({
        id: r.id,
        number: setPetNumber(r.number),
        status: r.status,
        memberName: r.user.displayName,
        petName: r.pet?.name ?? null,
        petSpecies: r.pet?.species ?? null,
        humanSizes: r.humanSizes,
        petSize: r.petSize,
        placements: r._count.placements,
        designs: r._count.designs,
        quoteAmountIrr: r.quoteAmountIrr,
        estimatedReadyAt: r.estimatedReadyAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
      counts,
    };
  }

  async detail(id: string): Promise<AdminSetPetDetailDto> {
    const r = await this.prisma.setPetRequest.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, displayName: true } },
        pet: { select: { id: true, name: true, species: true } },
        placements: { include: { designFile: true } },
        designs: { orderBy: { createdAt: "asc" } },
        events: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!r) throw new NotFoundApiException("Set Pet request", { id });
    const adminIds = [...new Set([r.quotedByAdminUserId, ...r.events.map((e) => e.adminUserId)].filter((x): x is string => !!x))];
    const admins = adminIds.length ? await this.prisma.adminUser.findMany({ where: { id: { in: adminIds } }, select: { id: true, user: { select: { displayName: true } } } }) : [];
    const adminName = (adminId: string | null) => (adminId ? admins.find((a) => a.id === adminId)?.user.displayName ?? null : null);
    const fileDto = (f: (typeof r.designs)[number]) => ({
      id: f.id,
      mimeType: f.mimeType,
      fileSizeBytes: f.fileSizeBytes,
      originalFilename: f.originalFilename,
      previewable: f.previewable,
      status: f.status,
      rejectReason: f.rejectReason,
      uploadedAt: f.uploadedAt?.toISOString() ?? null,
    });
    return {
      id: r.id,
      number: setPetNumber(r.number),
      status: r.status,
      member: { id: r.user.id, displayName: r.user.displayName },
      pet: r.pet ? { id: r.pet.id, name: r.pet.name, species: r.pet.species } : null,
      human: { colour: r.humanColour, sizes: r.humanSizes },
      petGarment: {
        size: r.petSize,
        colour: r.petColour,
        neckCm: num(r.petNeckCm),
        chestCm: num(r.petChestCm),
        backLengthCm: num(r.petBackLengthCm),
        weightKg: num(r.petWeightKg),
      },
      notes: r.notes,
      placements: r.placements.map((p) => ({ zone: p.zone, designFile: fileDto(p.designFile) })),
      designs: r.designs.map(fileDto),
      quote: { amountIrr: r.quoteAmountIrr, note: r.quoteNote, estimatedReadyAt: r.estimatedReadyAt?.toISOString() ?? null, quotedAt: r.quotedAt?.toISOString() ?? null, quotedBy: adminName(r.quotedByAdminUserId) },
      shippingNote: r.shippingNote,
      cancelled: r.cancelledAt ? { at: r.cancelledAt.toISOString(), by: r.cancelledBy, reason: r.cancelReason } : null,
      adminNote: r.adminNote,
      allowedTransitions: SET_PET_STAFF_TRANSITIONS[r.status],
      canQuote: r.status === S.SUBMITTED || r.status === S.QUOTED,
      timeline: r.events.map((e) => ({ id: e.id, at: e.createdAt.toISOString(), from: e.fromStatus, to: e.toStatus, actor: e.actor, staffName: adminName(e.adminUserId), note: e.note })),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  /** Price and ready-by date with a note to the member. Allowed while SUBMITTED, and again while QUOTED (a revised quote). */
  async quote(admin: ResolvedAdminContext, id: string, input: { amountIrr: number; estimatedReadyAt: string; note: string }, requestId?: string) {
    const readyBy = new Date(input.estimatedReadyAt);
    if (!Number.isFinite(readyBy.getTime()) || readyBy.getTime() < Date.now() - 86400e3) throw new ValidationApiException({ field: "estimatedReadyAt", reason: "IN_THE_PAST" });
    const row = await this.prisma.$transaction(async (tx) => {
      const current = await tx.setPetRequest.findUnique({ where: { id } });
      if (!current) throw new NotFoundApiException("Set Pet request", { id });
      if (current.status !== S.SUBMITTED && current.status !== S.QUOTED) throw new ValidationApiException({ field: "status", reason: "INVALID_TRANSITION", from: current.status, to: S.QUOTED });
      const now = new Date();
      const done = await tx.setPetRequest.updateMany({
        where: { id, status: current.status },
        data: { status: S.QUOTED, quoteAmountIrr: input.amountIrr, quoteNote: input.note.trim(), estimatedReadyAt: readyBy, quotedAt: now, quotedByAdminUserId: admin.adminUserId },
      });
      if (!done.count) throw new ValidationApiException({ field: "status", reason: "CHANGED_CONCURRENTLY" });
      await tx.setPetRequestEvent.create({ data: { requestId: id, fromStatus: current.status, toStatus: S.QUOTED, actor: SetPetActor.STAFF, adminUserId: admin.adminUserId, note: input.note.trim() } });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "set_pet.quoted",
        entityType: "SET_PET_REQUEST",
        entityId: id,
        reason: input.note.trim(),
        beforeSummary: { status: current.status, quoteAmountIrr: current.quoteAmountIrr },
        afterSummary: { status: S.QUOTED, quoteAmountIrr: input.amountIrr, estimatedReadyAt: readyBy.toISOString() },
        requestId,
        tx,
      });
      return current;
    });
    // `row` is the request as it was before this quote: a second quote tells the member the price changed.
    await this.notify(row.userId, row.status === S.QUOTED ? "set_pet.quote_revised" : "set_pet.quoted", id, row.number);
    return this.detail(id);
  }

  /** Production, shipping, or a staff cancellation (with the reason the member will read). */
  async changeStatus(admin: ResolvedAdminContext, id: string, input: { to: SetPetRequestStatus; note?: string; shippingNote?: string }, requestId?: string) {
    const note = input.note?.trim() || null;
    if (input.to === S.CANCELLED && (!note || note.length < 3)) throw new ValidationApiException({ field: "note", reason: "REQUIRED_FOR_CANCELLATION" });
    const row = await this.prisma.$transaction(async (tx) => {
      const current = await tx.setPetRequest.findUnique({ where: { id } });
      if (!current) throw new NotFoundApiException("Set Pet request", { id });
      if (!SET_PET_STAFF_TRANSITIONS[current.status].includes(input.to)) throw new ValidationApiException({ field: "status", reason: "INVALID_TRANSITION", from: current.status, to: input.to, allowed: SET_PET_STAFF_TRANSITIONS[current.status] });
      const now = new Date();
      const data: Prisma.SetPetRequestUpdateManyMutationInput =
        input.to === S.IN_PRODUCTION
          ? { status: S.IN_PRODUCTION, productionStartedAt: now }
          : input.to === S.SHIPPED
            ? { status: S.SHIPPED, shippedAt: now, shippingNote: input.shippingNote?.trim() || null }
            : { status: S.CANCELLED, cancelledAt: now, cancelledBy: SetPetActor.STAFF, cancelReason: note };
      const done = await tx.setPetRequest.updateMany({ where: { id, status: current.status }, data });
      if (!done.count) throw new ValidationApiException({ field: "status", reason: "CHANGED_CONCURRENTLY" });
      await tx.setPetRequestEvent.create({ data: { requestId: id, fromStatus: current.status, toStatus: input.to, actor: SetPetActor.STAFF, adminUserId: admin.adminUserId, note: input.to === S.SHIPPED ? input.shippingNote?.trim() || note : note } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "set_pet.status_changed", entityType: "SET_PET_REQUEST", entityId: id, reason: note ?? undefined, beforeSummary: { status: current.status }, afterSummary: { status: input.to }, requestId, tx });
      return current;
    });
    const type = input.to === S.IN_PRODUCTION ? "set_pet.in_production" : input.to === S.SHIPPED ? "set_pet.shipped" : "set_pet.cancelled";
    await this.notify(row.userId, type, id, row.number, input.to === S.CANCELLED ? { reason: note ?? "" } : input.to === S.SHIPPED ? { shippingNote: input.shippingNote?.trim() || "—" } : {});
    return this.detail(id);
  }

  /** A staff-only note; the member never sees it. */
  async saveAdminNote(admin: ResolvedAdminContext, id: string, note: string, requestId?: string) {
    const current = await this.prisma.setPetRequest.findUnique({ where: { id }, select: { id: true } });
    if (!current) throw new NotFoundApiException("Set Pet request", { id });
    await this.prisma.$transaction(async (tx) => {
      await tx.setPetRequest.update({ where: { id }, data: { adminNote: note.trim() || null } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "set_pet.note_saved", entityType: "SET_PET_REQUEST", entityId: id, requestId, tx });
    });
    return this.detail(id);
  }

  /**
   * A short-lived private link to one member design, always as an attachment, with the reason audited. Only a READY
   * file that belongs to a request can be opened; a member's unattached uploads are not browsable.
   */
  async downloadDesign(admin: ResolvedAdminContext, fileId: string, reason: string, requestId?: string) {
    const file = await this.prisma.setPetDesignFile.findUnique({ where: { id: fileId } });
    if (!file || !file.requestId) throw new NotFoundApiException("Set Pet design", { fileId });
    if (file.status !== SetPetDesignFileStatus.READY) throw new ValidationApiException({ field: "fileId", reason: "NOT_READY", status: file.status });
    const options = setPetDesignDownload(file);
    const target = await this.storage.createPrivateDownloadTarget(file.objectKey, options);
    await this.audit.record({ adminUserId: admin.adminUserId, action: "set_pet.design_opened", entityType: "SET_PET_REQUEST", entityId: file.requestId, reason, afterSummary: { fileId, mimeType: file.mimeType, previewable: file.previewable }, requestId });
    return { fileId, filename: options.filename, ...target };
  }

  private async notify(userId: string, type: string, id: string, number: number, params: Record<string, string> = {}) {
    try {
      await this.notifications.notify({ userId, type, category: NotificationCategory.COMMERCE, templateParams: { number: setPetNumber(number), ...params }, entityType: "SetPetRequest", entityId: id });
    } catch (error) {
      // The staff action is committed and on the member's timeline; a failed notification is logged, not hidden as success.
      this.logger.error(`Set Pet notification ${type} for ${id} failed`, error instanceof Error ? error.stack : undefined);
    }
  }
}
