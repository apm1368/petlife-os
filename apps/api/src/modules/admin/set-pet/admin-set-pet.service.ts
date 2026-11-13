import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { NotificationCategory, Prisma, SetPetActor, SetPetDesignFileStatus, SetPetProofStatus, SetPetRequestStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { SET_PET_GARMENTS, SET_PET_ZONE_KEYS, type AdminSetPetDetailDto, type AdminSetPetListDto, type AdminSetPetProofUploadTargetDto, type AdminSetPetSettingsDto, type SetPetPrice } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ApiException, NotFoundApiException, ValidationApiException } from "../../../common/errors/api-exception";
import { StorageService } from "../../storage/storage.service";
import { NotificationOrchestratorService } from "../../notifications/notification-orchestrator.service";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import { readPriceTable, setPetDesignDownloadOptions, setPetReference, SetPetService, cleanText } from "../../set-pet/set-pet.service";
import { detectKind, isPreviewable, MIME_OF, stripMetadata, type SetPetFileKind } from "../../set-pet/set-pet-files";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

const S = SetPetRequestStatus;
const PAGE_SIZE = 30;
/** A proof is a raster mockup staff make; 15 MB is plenty. */
const PROOF_MAX_BYTES = 15 * 1024 * 1024;
const PROOF_TYPES: Record<string, { kind: SetPetFileKind; ext: string }> = {
  "image/jpeg": { kind: "jpeg", ext: "jpg" },
  "image/png": { kind: "png", ext: "png" },
  "image/webp": { kind: "webp", ext: "webp" },
};

/** Staff send a proof while the order waits for one, and may replace a proof the member has not answered yet. */
const PROOF_FROM: SetPetRequestStatus[] = [S.SUBMITTED, S.PROOF_SENT];
/** A design can be refused (unsuitable or copyrighted, owner F9) until the member has approved a proof. */
const REJECT_DESIGN_FROM: SetPetRequestStatus[] = [S.SUBMITTED, S.PROOF_SENT];
/** Before printing a cancellation is free (refunded if paid); after it, only for a print defect, always refunded (F8). */
const STAFF_CANCEL_FROM: SetPetRequestStatus[] = [S.SUBMITTED, S.NEEDS_NEW_DESIGN, S.PROOF_SENT, S.AWAITING_PAYMENT, S.PAID, S.IN_PRODUCTION, S.SHIPPED];
const PRINT_DEFECT_ONLY: SetPetRequestStatus[] = [S.IN_PRODUCTION, S.SHIPPED];
const PAID_STATUSES: SetPetRequestStatus[] = [S.PAID, S.IN_PRODUCTION, S.SHIPPED];

/**
 * Admin side of «ست پت» (owner's #368 answers). Staff read every order, send the print proof (always), refuse a design
 * with a reason, start printing, ship, or cancel (refunding to the wallet when paid), and keep the fixed price table.
 * Each change is one compare-and-set, one timeline row (the member reads the same timeline), one audit row, and a
 * notification to the member (in-app + email). Design files open only through an audited, reasoned download.
 */
@Injectable()
export class AdminSetPetService {
  private readonly logger = new Logger(AdminSetPetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditLogService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationOrchestratorService,
    private readonly setPet: SetPetService,
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
    const waiting = query.status === S.SUBMITTED || query.status === S.PAID;
    const [rows, total, groups] = await Promise.all([
      this.prisma.setPetRequest.findMany({
        where,
        // Oldest waiting first, so nobody's order sits at the bottom of the queue.
        orderBy: [{ updatedAt: waiting ? "asc" : "desc" }, { id: "asc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { user: { select: { displayName: true } }, items: { select: { garment: true } }, _count: { select: { placements: true } } },
      }),
      this.prisma.setPetRequest.count({ where }),
      this.prisma.setPetRequest.groupBy({ by: ["status"], where: search, _count: { _all: true } }),
    ]);
    const counts = Object.fromEntries(Object.values(S).map((s) => [s, groups.find((g) => g.status === s)?._count._all ?? 0])) as Record<SetPetRequestStatus, number>;
    return {
      items: rows.map((r) => ({
        id: r.id,
        number: setPetReference(r.number),
        status: r.status,
        memberName: r.user.displayName,
        humanGarments: r.items.filter((i) => i.garment.startsWith("HUMAN_")).length,
        petGarments: r.items.filter((i) => i.garment.startsWith("PET_")).length,
        placements: r._count.placements,
        itemsTotalIrr: r.itemsTotalIrr,
        totalPaidIrr: r.totalPaidIrr,
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
        forPet: { select: { id: true, name: true, species: true, lifecycleStatus: true } },
        items: { orderBy: { position: "asc" }, include: { pet: { select: { id: true, name: true, species: true } } } },
        placements: { include: { designFile: true } },
        proofs: { where: { status: { not: SetPetProofStatus.UPLOADING } }, orderBy: { createdAt: "desc" } },
        events: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!r) throw new NotFoundApiException("Set Pet request", { id });
    const adminIds = [...new Set([...r.events.map((e) => e.adminUserId), ...r.proofs.map((p) => p.uploadedByAdminUserId)].filter((x): x is string => !!x))];
    const admins = adminIds.length ? await this.prisma.adminUser.findMany({ where: { id: { in: adminIds } }, select: { id: true, user: { select: { displayName: true } } } }) : [];
    const adminName = (adminId: string | null) => (adminId ? admins.find((a) => a.id === adminId)?.user.displayName ?? null : null);
    const iso = (d: Date | null) => d?.toISOString() ?? null;
    return {
      id: r.id,
      number: setPetReference(r.number),
      status: r.status,
      member: { id: r.user.id, displayName: r.user.displayName },
      forPet: r.forPet ? { id: r.forPet.id, name: r.forPet.name, species: r.forPet.species, lifecycleStatus: r.forPet.lifecycleStatus } : null,
      items: r.items.map((i) => ({
        position: i.position, garment: i.garment, size: i.size, colour: i.colour, petId: i.petId, petName: i.petName,
        petSpecies: i.petSpecies === "DOG" || i.petSpecies === "CAT" ? i.petSpecies : null,
        pet: i.pet ? { id: i.pet.id, name: i.pet.name, species: i.pet.species } : null,
      })),
      placements: SET_PET_ZONE_KEYS.flatMap((zone) => r.placements.filter((p) => p.zone === zone)).map((p) => ({
        zone: p.zone, designFileId: p.designFileId, text: p.text, font: p.font, textColour: p.textColour,
        scale: Number(p.scale), offsetX: Number(p.offsetX), offsetY: Number(p.offsetY),
        designFile: p.designFile
          ? { id: p.designFile.id, mimeType: p.designFile.mimeType, fileSizeBytes: p.designFile.fileSizeBytes, originalFilename: p.designFile.originalFilename, previewable: p.designFile.previewable, widthPx: p.designFile.widthPx, heightPx: p.designFile.heightPx, status: p.designFile.status, uploadedAt: iso(p.designFile.uploadedAt) }
          : null,
      })),
      notes: r.notes,
      price: { lines: (r.priceLines as unknown as SetPetPrice["lines"]) ?? [], subtotalIrr: r.subtotalIrr, discountPercent: r.discountPercent, discountIrr: r.discountIrr, totalIrr: r.itemsTotalIrr },
      payment: { shippingProvider: r.shippingProvider, shippingIrr: r.shippingIrr, shippingAddress: r.shippingAddress, totalPaidIrr: r.totalPaidIrr, paidAt: iso(r.paidAt), refundedIrr: r.refundedIrr, refundedAt: iso(r.refundedAt) },
      proofs: r.proofs.map((p) => ({ id: p.id, status: p.status, mimeType: p.mimeType, note: p.note, petPrintWidthCm: p.petPrintWidthCm, petPrintHeightCm: p.petPrintHeightCm, uploadedBy: adminName(p.uploadedByAdminUserId), sentAt: iso(p.sentAt), decidedAt: iso(p.decidedAt) })),
      designRejectReason: r.designRejectReason,
      estimatedReadyAt: iso(r.estimatedReadyAt),
      shippingNote: r.shippingNote,
      cancelled: r.cancelledAt ? { at: r.cancelledAt.toISOString(), by: r.cancelledBy, reason: r.cancelReason } : null,
      adminNote: r.adminNote,
      actions: {
        sendProof: PROOF_FROM.includes(r.status),
        rejectDesign: REJECT_DESIGN_FROM.includes(r.status),
        startProduction: r.status === S.PAID,
        ship: r.status === S.IN_PRODUCTION,
        cancel: STAFF_CANCEL_FROM.includes(r.status),
        refundsOnCancel: PAID_STATUSES.includes(r.status) && !r.refundedAt,
        printDefectOnly: PRINT_DEFECT_ONLY.includes(r.status),
      },
      timeline: r.events.map((e) => ({ id: e.id, at: e.createdAt.toISOString(), from: e.fromStatus, to: e.toStatus, actor: e.actor, staffName: adminName(e.adminUserId), note: e.note })),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  // ------------------------------------------------------------------------------------------------ proofs (F5)

  /** Step 1: a private upload target for the proof image (JPEG/PNG/WebP only; checked again on send). */
  async proofUploadTarget(admin: ResolvedAdminContext, id: string, input: { contentType: string; fileSizeBytes: number }): Promise<AdminSetPetProofUploadTargetDto> {
    const type = PROOF_TYPES[input.contentType.toLowerCase().split(";")[0]!.trim()];
    if (!type) throw new ValidationApiException({ field: "contentType", reason: "JPEG_PNG_WEBP_ONLY" });
    if (!Number.isInteger(input.fileSizeBytes) || input.fileSizeBytes <= 0 || input.fileSizeBytes > PROOF_MAX_BYTES) throw new ValidationApiException({ field: "fileSizeBytes", reason: "TOO_LARGE", maxBytes: PROOF_MAX_BYTES });
    const request = await this.prisma.setPetRequest.findUnique({ where: { id }, select: { status: true } });
    if (!request) throw new NotFoundApiException("Set Pet request", { id });
    if (!PROOF_FROM.includes(request.status)) throw new ValidationApiException({ field: "status", reason: "INVALID_TRANSITION", from: request.status, to: S.PROOF_SENT });
    const objectKey = `set-pet-proofs/${id}/${randomUUID()}.${type.ext}`;
    const target = await this.storage.createSetPetProofUploadTarget(objectKey, MIME_OF[type.kind], input.fileSizeBytes);
    const proof = await this.prisma.setPetProof.create({ data: { requestId: id, objectKey, mimeType: MIME_OF[type.kind], fileSizeBytes: input.fileSizeBytes, uploadedByAdminUserId: admin.adminUserId } });
    return { proofId: proof.id, uploadUrl: target.uploadUrl, method: target.method, headers: target.headers, expiresInSeconds: target.expiresInSeconds };
  }

  /**
   * Step 2: the uploaded proof is checked (magic bytes, metadata stripped) and sent to the member with a note and the
   * pet print size (owner P28). An earlier unanswered proof is withdrawn.
   */
  async sendProof(admin: ResolvedAdminContext, id: string, proofId: string, input: { note?: string; petPrintWidthCm?: number; petPrintHeightCm?: number }, requestId?: string) {
    const proof = await this.prisma.setPetProof.findFirst({ where: { id: proofId, requestId: id, status: SetPetProofStatus.UPLOADING } });
    if (!proof) throw new NotFoundApiException("Set Pet proof", { proofId });
    const kind = Object.values(PROOF_TYPES).find((t) => MIME_OF[t.kind] === proof.mimeType)?.kind;
    let bytes: Buffer;
    try {
      bytes = await this.readProof(proof.objectKey);
    } catch (e) {
      if (e instanceof ApiException) throw e;
      throw new ApiException("SET_PET_PROOF_NOT_UPLOADED", "The proof has not arrived yet.", HttpStatus.CONFLICT);
    }
    const actual = kind ? detectKind(bytes.subarray(0, 4096), kind) : null;
    const cleaned = actual && isPreviewable(actual) ? stripMetadata(bytes, actual) : null;
    if (!actual || !cleaned) {
      await this.prisma.setPetProof.delete({ where: { id: proofId } });
      await this.storage.deletePrivateObject(proof.objectKey).catch(() => undefined);
      throw new ValidationApiException({ field: "proof", reason: "NOT_A_JPEG_PNG_OR_WEBP" });
    }
    if (!cleaned.equals(bytes)) await this.storage.putSetPetProof(proof.objectKey, cleaned, MIME_OF[actual]);

    const note = cleanText(input.note ?? "", 1000, true) || null;
    const row = await this.prisma.$transaction(async (tx) => {
      const current = await tx.setPetRequest.findUnique({ where: { id } });
      if (!current) throw new NotFoundApiException("Set Pet request", { id });
      if (!PROOF_FROM.includes(current.status)) throw new ValidationApiException({ field: "status", reason: "INVALID_TRANSITION", from: current.status, to: S.PROOF_SENT });
      const moved = await tx.setPetRequest.updateMany({ where: { id, status: current.status }, data: { status: S.PROOF_SENT } });
      if (!moved.count) throw new ValidationApiException({ field: "status", reason: "CHANGED_CONCURRENTLY" });
      await tx.setPetProof.updateMany({ where: { requestId: id, status: SetPetProofStatus.SENT }, data: { status: SetPetProofStatus.SUPERSEDED, decidedAt: new Date() } });
      const sent = await tx.setPetProof.updateMany({
        where: { id: proofId, status: SetPetProofStatus.UPLOADING },
        data: { status: SetPetProofStatus.SENT, sentAt: new Date(), note, fileSizeBytes: cleaned.length, petPrintWidthCm: input.petPrintWidthCm ?? null, petPrintHeightCm: input.petPrintHeightCm ?? null },
      });
      if (!sent.count) throw new ValidationApiException({ field: "proof", reason: "CHANGED_CONCURRENTLY" });
      await tx.setPetRequestEvent.create({ data: { requestId: id, fromStatus: current.status, toStatus: S.PROOF_SENT, actor: SetPetActor.STAFF, adminUserId: admin.adminUserId, note } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "set_pet.proof_sent", entityType: "SET_PET_REQUEST", entityId: id, reason: note ?? undefined, beforeSummary: { status: current.status }, afterSummary: { status: S.PROOF_SENT, proofId }, requestId, tx });
      return current;
    });
    await this.notify(row.userId, "set_pet.proof_sent", id, row.number);
    return this.detail(id);
  }

  /** A short-lived link for staff to see a proof they (or a colleague) sent. */
  async proofLink(id: string, proofId: string) {
    const proof = await this.prisma.setPetProof.findFirst({ where: { id: proofId, requestId: id, status: { not: SetPetProofStatus.UPLOADING } } });
    if (!proof) throw new NotFoundApiException("Set Pet proof", { proofId });
    const target = await this.storage.createPrivateDownloadTarget(proof.objectKey);
    return { url: target.downloadUrl, expiresInSeconds: target.expiresInSeconds };
  }

  // ------------------------------------------------------------------------------------------------ status changes

  /** Owner F9: an unsuitable or copyrighted design is refused with a reason; the member sends another (and may edit). */
  async rejectDesign(admin: ResolvedAdminContext, id: string, reason: string, requestId?: string) {
    const note = cleanText(reason, 1000, true);
    if (note.length < 3) throw new ValidationApiException({ field: "reason", reason: "REQUIRED" });
    const row = await this.prisma.$transaction(async (tx) => {
      const current = await tx.setPetRequest.findUnique({ where: { id } });
      if (!current) throw new NotFoundApiException("Set Pet request", { id });
      if (!REJECT_DESIGN_FROM.includes(current.status)) throw new ValidationApiException({ field: "status", reason: "INVALID_TRANSITION", from: current.status, to: S.NEEDS_NEW_DESIGN });
      const moved = await tx.setPetRequest.updateMany({ where: { id, status: current.status }, data: { status: S.NEEDS_NEW_DESIGN, designRejectReason: note } });
      if (!moved.count) throw new ValidationApiException({ field: "status", reason: "CHANGED_CONCURRENTLY" });
      await tx.setPetProof.updateMany({ where: { requestId: id, status: SetPetProofStatus.SENT }, data: { status: SetPetProofStatus.SUPERSEDED, decidedAt: new Date() } });
      await tx.setPetRequestEvent.create({ data: { requestId: id, fromStatus: current.status, toStatus: S.NEEDS_NEW_DESIGN, actor: SetPetActor.STAFF, adminUserId: admin.adminUserId, note } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "set_pet.design_rejected", entityType: "SET_PET_REQUEST", entityId: id, reason: note, beforeSummary: { status: current.status }, afterSummary: { status: S.NEEDS_NEW_DESIGN }, requestId, tx });
      return current;
    });
    await this.notify(row.userId, "set_pet.needs_new_design", id, row.number, { reason: note });
    return this.detail(id);
  }

  /**
   * Printing starts (PAID → IN_PRODUCTION), the set ships with its tracking (IN_PRODUCTION → SHIPPED), or staff cancel
   * with the reason the member will read. A paid order is refunded in full to the wallet on cancellation; once
   * printing started that is only for a print defect (owner F8), which staff confirm explicitly.
   */
  async changeStatus(admin: ResolvedAdminContext, id: string, input: { to: SetPetRequestStatus; note?: string; shippingNote?: string; printDefect?: boolean }, requestId?: string) {
    const note = cleanText(input.note ?? "", 1000, true) || null;
    const shippingNote = cleanText(input.shippingNote ?? "", 500, true) || null;
    if (input.to === S.CANCELLED && (!note || note.length < 3)) throw new ValidationApiException({ field: "note", reason: "REQUIRED_FOR_CANCELLATION" });
    if (input.to === S.SHIPPED && !shippingNote) throw new ValidationApiException({ field: "shippingNote", reason: "REQUIRED" });
    let refunded = 0;
    const row = await this.prisma.$transaction(async (tx) => {
      const current = await tx.setPetRequest.findUnique({ where: { id } });
      if (!current) throw new NotFoundApiException("Set Pet request", { id });
      const allowed =
        input.to === S.IN_PRODUCTION ? current.status === S.PAID
        : input.to === S.SHIPPED ? current.status === S.IN_PRODUCTION
        : input.to === S.CANCELLED ? STAFF_CANCEL_FROM.includes(current.status)
        : false;
      if (!allowed) throw new ValidationApiException({ field: "status", reason: "INVALID_TRANSITION", from: current.status, to: input.to });
      if (input.to === S.CANCELLED && PRINT_DEFECT_ONLY.includes(current.status) && !input.printDefect) throw new ValidationApiException({ field: "printDefect", reason: "PRINT_DEFECT_ONLY_AFTER_PRINTING" });
      const now = new Date();
      const data: Prisma.SetPetRequestUpdateManyMutationInput =
        input.to === S.IN_PRODUCTION
          ? { status: S.IN_PRODUCTION, productionStartedAt: now }
          : input.to === S.SHIPPED
            ? { status: S.SHIPPED, shippedAt: now, shippingNote }
            : { status: S.CANCELLED, cancelledAt: now, cancelledBy: SetPetActor.STAFF, cancelReason: note };
      const done = await tx.setPetRequest.updateMany({ where: { id, status: current.status }, data });
      if (!done.count) throw new ValidationApiException({ field: "status", reason: "CHANGED_CONCURRENTLY" });
      if (input.to === S.CANCELLED) {
        if (PAID_STATUSES.includes(current.status)) refunded = await this.setPet.refundInTx(tx, id);
        await tx.setPetProof.updateMany({ where: { requestId: id, status: SetPetProofStatus.SENT }, data: { status: SetPetProofStatus.SUPERSEDED, decidedAt: now } });
      }
      await tx.setPetRequestEvent.create({ data: { requestId: id, fromStatus: current.status, toStatus: input.to, actor: SetPetActor.STAFF, adminUserId: admin.adminUserId, note: input.to === S.SHIPPED ? shippingNote : note } });
      await this.audit.record({
        adminUserId: admin.adminUserId, action: "set_pet.status_changed", entityType: "SET_PET_REQUEST", entityId: id, reason: note ?? undefined,
        beforeSummary: { status: current.status }, afterSummary: { status: input.to, refundedIrr: refunded || undefined, printDefect: input.printDefect || undefined }, requestId, tx,
      });
      return current;
    });
    const type = input.to === S.IN_PRODUCTION ? "set_pet.in_production" : input.to === S.SHIPPED ? "set_pet.shipped" : refunded ? "set_pet.cancelled_refunded" : "set_pet.cancelled";
    await this.notify(row.userId, type, id, row.number, input.to === S.CANCELLED ? { reason: note ?? "" } : input.to === S.SHIPPED ? { shippingNote: shippingNote ?? "" } : {});
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
   * A short-lived private link to one design printed on this order, always as an attachment, with the reason audited.
   * Only a READY file placed on the given order opens; a member's other uploads are not browsable.
   */
  async downloadDesign(admin: ResolvedAdminContext, id: string, fileId: string, reason: string, requestId?: string) {
    const placement = await this.prisma.setPetPlacement.findFirst({ where: { requestId: id, designFileId: fileId }, include: { designFile: true } });
    const file = placement?.designFile;
    if (!file) throw new NotFoundApiException("Set Pet design", { fileId });
    if (file.status !== SetPetDesignFileStatus.READY) throw new ValidationApiException({ field: "fileId", reason: "NOT_READY", status: file.status });
    const options = setPetDesignDownloadOptions(file);
    const target = await this.storage.createPrivateDownloadTarget(file.objectKey, options);
    await this.audit.record({ adminUserId: admin.adminUserId, action: "set_pet.design_opened", entityType: "SET_PET_REQUEST", entityId: id, reason, afterSummary: { fileId, mimeType: file.mimeType, previewable: file.previewable }, requestId });
    return { fileId, filename: options.filename, ...target };
  }

  // ------------------------------------------------------------------------------------------------ price table

  async settings(): Promise<AdminSetPetSettingsDto> {
    const row = await this.prisma.setPetSettings.findUnique({ where: { id: "default" } });
    const table = readPriceTable(row);
    return {
      ...table,
      productionWorkingDays: row?.productionWorkingDays ?? 5,
      workshopCity: row?.workshopCity ?? null,
      workshopLatitude: row?.workshopLatitude ?? null,
      workshopLongitude: row?.workshopLongitude ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }

  /** Owner F1/P36/P37: the fixed price table and set discount. Applies to orders sent or edited from now on. */
  async saveSettings(admin: ResolvedAdminContext, input: Omit<AdminSetPetSettingsDto, "updatedAt">, requestId?: string): Promise<AdminSetPetSettingsDto> {
    const prices = <K extends string>(raw: Partial<Record<K, number>> | undefined, keys: readonly K[], field: string) => {
      const out: Record<string, number> = {};
      for (const key of keys) {
        const v = raw?.[key] ?? 0;
        if (!Number.isInteger(v) || v < 0 || v > 2_000_000_000 || v % 10 !== 0) throw new ValidationApiException({ field: `${field}.${key}`, reason: "WHOLE_TOMAN_IRR" });
        out[key] = v;
      }
      return out;
    };
    const garmentPricesIrr = prices(input.garmentPricesIrr, SET_PET_GARMENTS, "garmentPricesIrr");
    const zonePricesIrr = prices(input.zonePricesIrr, SET_PET_ZONE_KEYS, "zonePricesIrr");
    if (!Number.isInteger(input.setDiscountPercent) || input.setDiscountPercent < 0 || input.setDiscountPercent > 90) throw new ValidationApiException({ field: "setDiscountPercent", reason: "OUT_OF_RANGE", min: 0, max: 90 });
    if (!Number.isInteger(input.productionWorkingDays) || input.productionWorkingDays < 1 || input.productionWorkingDays > 60) throw new ValidationApiException({ field: "productionWorkingDays", reason: "OUT_OF_RANGE" });
    const city = cleanText(input.workshopCity ?? "", 80) || null;
    const lat = input.workshopLatitude ?? null;
    const lng = input.workshopLongitude ?? null;
    if ((lat === null) !== (lng === null) || (lat !== null && (lat < 25 || lat > 40 || lng! < 44 || lng! > 63.5))) throw new ValidationApiException({ field: "workshopLatitude", reason: "OUT_OF_RANGE" });
    const before = await this.settings();
    const data = { garmentPricesIrr, zonePricesIrr, setDiscountPercent: input.setDiscountPercent, productionWorkingDays: input.productionWorkingDays, workshopCity: city, workshopLatitude: lat, workshopLongitude: lng, updatedByAdminUserId: admin.adminUserId };
    await this.prisma.$transaction(async (tx) => {
      await tx.setPetSettings.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
      await this.audit.record({
        adminUserId: admin.adminUserId, action: "set_pet.prices_saved", entityType: "SET_PET_SETTINGS", entityId: "default",
        beforeSummary: { garmentPricesIrr: before.garmentPricesIrr, zonePricesIrr: before.zonePricesIrr, setDiscountPercent: before.setDiscountPercent, productionWorkingDays: before.productionWorkingDays },
        afterSummary: { garmentPricesIrr, zonePricesIrr, setDiscountPercent: input.setDiscountPercent, productionWorkingDays: input.productionWorkingDays },
        requestId, tx,
      });
    });
    return this.settings();
  }

  // ------------------------------------------------------------------------------------------------ helpers

  private async readProof(key: string): Promise<Buffer> {
    const { body } = await this.storage.openSetPetProof(key);
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of body as AsyncIterable<Buffer | string>) {
      const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      total += buffer.length;
      if (total > PROOF_MAX_BYTES) {
        (body as { destroy?: () => void }).destroy?.();
        throw new ValidationApiException({ field: "proof", reason: "TOO_LARGE", maxBytes: PROOF_MAX_BYTES });
      }
      chunks.push(buffer);
    }
    return Buffer.concat(chunks);
  }

  private async notify(userId: string, type: string, id: string, number: number, params: Record<string, string> = {}) {
    try {
      await this.notifications.notify({ userId, type, category: NotificationCategory.COMMERCE, templateParams: { number: setPetReference(number), ...params }, entityType: "SetPetRequest", entityId: id, deepLink: `/orders/set-pet/${id}` });
    } catch (error) {
      // The staff action is committed and on the member's timeline; a failed notification is logged, not hidden as success.
      this.logger.error(`Set Pet notification ${type} for ${id} failed`, error instanceof Error ? error.stack : undefined);
    }
  }
}
