import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { Prisma, SetPetActor, SetPetDesignFileStatus, SetPetRequestStatus, type SetPetDesignFile, type SetPetSize, type SetPetZone } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  SET_PET_MEASUREMENT_RANGES,
  SET_PET_SIZES,
  SET_PET_ZONES,
  type SetPetDesignFileDto,
  type SetPetOptionsDto,
  type SetPetRequestDto,
  type SetPetUploadTargetDto,
} from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ApiException, NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { StorageService } from "../storage/storage.service";
import { PetAccessService } from "../pet-access/pet-access.service";
import {
  claimedKind,
  detectKind,
  isPreviewable,
  MIME_OF,
  safeFilename,
  SET_PET_FILE_MAX_BYTES,
  SET_PET_MAX_DESIGNS,
  SET_PET_MAX_LOOSE_FILES,
  stripMetadata,
  type SetPetFileKind,
} from "./set-pet-files";

/** At most this many requests waiting on staff or on the member at once (SUBMITTED or QUOTED). */
export const SET_PET_MAX_OPEN_REQUESTS = 3;
export const SET_PET_MAX_HUMAN_GARMENTS = 10;
/** Unplaced uploads older than this are removed when the member next uploads. */
const LOOSE_FILE_TTL_MS = 7 * 24 * 3600e3;
const MEMBER_CANCELLABLE: SetPetRequestStatus[] = [SetPetRequestStatus.SUBMITTED, SetPetRequestStatus.QUOTED];
const HEAD_BYTES = 4096;

const KIND_BY_EXTENSION: Record<string, SetPetFileKind> = { jpg: "jpeg", png: "png", webp: "webp", heic: "heic", pdf: "pdf", svg: "svg", ai: "ai", psd: "psd" };

const REQUEST_INCLUDE = {
  placements: { orderBy: { zone: "asc" } },
  designs: { orderBy: { createdAt: "asc" } },
  events: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.SetPetRequestInclude;
type RequestRow = Prisma.SetPetRequestGetPayload<{ include: typeof REQUEST_INCLUDE }>;

export interface CreateSetPetRequestInput {
  petId?: string;
  humanColour: string;
  humanSizes: SetPetSize[];
  petSize: SetPetSize;
  petColour: string;
  petMeasurements: { neckCm: number; chestCm: number; backLengthCm: number; weightKg: number };
  placements: Array<{ zone: SetPetZone; designFileId: string }>;
  notes?: string;
}

/** How staff download a design: always as an attachment, and print files as opaque bytes (an SVG can carry script). */
export function setPetDesignDownloadOptions(file: Pick<SetPetDesignFile, "objectKey" | "mimeType" | "previewable" | "originalFilename">) {
  const extension = file.objectKey.split(".").pop() ?? "bin";
  return { filename: file.originalFilename ?? `design.${extension}`, contentType: file.previewable ? file.mimeType : "application/octet-stream" };
}

export function setPetReference(number: number) {
  return `SP-${String(number).padStart(6, "0")}`;
}

export function toSetPetDesignFileDto(file: SetPetDesignFile): SetPetDesignFileDto {
  return {
    id: file.id,
    status: file.status,
    mimeType: file.mimeType,
    fileSizeBytes: file.fileSizeBytes,
    originalFilename: file.originalFilename,
    previewable: file.previewable,
    requestId: file.requestId,
    rejectReason: file.rejectReason,
    createdAt: file.createdAt.toISOString(),
  };
}

/** The member's view of a request: never the staff-only note or which admin did what. */
export function toSetPetRequestDto(row: RequestRow): SetPetRequestDto {
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  return {
    id: row.id,
    number: row.number,
    reference: setPetReference(row.number),
    status: row.status,
    petId: row.petId,
    humanColour: row.humanColour,
    humanSizes: row.humanSizes,
    petSize: row.petSize,
    petColour: row.petColour,
    petMeasurements: { neckCm: Number(row.petNeckCm), chestCm: Number(row.petChestCm), backLengthCm: Number(row.petBackLengthCm), weightKg: Number(row.petWeightKg) },
    notes: row.notes,
    placements: row.placements.map((p) => ({ zone: p.zone, designFileId: p.designFileId })),
    designs: row.designs.map(toSetPetDesignFileDto),
    quote: row.quoteAmountIrr !== null && row.quotedAt ? { amountIrr: row.quoteAmountIrr, note: row.quoteNote, estimatedReadyAt: iso(row.estimatedReadyAt), quotedAt: row.quotedAt.toISOString() } : null,
    confirmedAt: iso(row.confirmedAt),
    productionStartedAt: iso(row.productionStartedAt),
    shippedAt: iso(row.shippedAt),
    shippingNote: row.shippingNote,
    cancelledAt: iso(row.cancelledAt),
    cancelledBy: row.cancelledBy,
    cancelReason: row.cancelReason,
    timeline: row.events.map((e) => ({ fromStatus: e.fromStatus, toStatus: e.toStatus, actor: e.actor, note: e.note, at: e.createdAt.toISOString() })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * «ست پت» for members: upload designs (private), place them on the fixed zones, send the request, then accept the
 * staff quote or cancel. Every read and write is scoped to the caller's own rows; someone else's id is a plain 404.
 */
@Injectable()
export class SetPetService {
  private readonly logger = new Logger(SetPetService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly events: DomainEventsService,
    private readonly petAccess: PetAccessService,
  ) {}

  options(): SetPetOptionsDto {
    return {
      sizes: SET_PET_SIZES,
      zones: (Object.entries(SET_PET_ZONES) as Array<[SetPetZone, (typeof SET_PET_ZONES)[SetPetZone]]>).map(([zone, z]) => ({ zone, garment: z.garment, widthCm: z.widthCm, heightCm: z.heightCm })),
      measurementRanges: SET_PET_MEASUREMENT_RANGES,
      acceptedExtensions: ["jpg", "jpeg", "png", "webp", "heic", "heif", "pdf", "svg", "ai", "psd"],
      maxFileBytes: SET_PET_FILE_MAX_BYTES,
      maxDesigns: SET_PET_MAX_DESIGNS,
      maxHumanGarments: SET_PET_MAX_HUMAN_GARMENTS,
    };
  }

  // ------------------------------------------------------------------------------------------------ design files

  async uploadTarget(userId: string, input: { filename: string; contentType: string; fileSizeBytes: number }): Promise<SetPetUploadTargetDto> {
    const claim = claimedKind(input.filename, input.contentType);
    if (!claim) throw new ApiException("SET_PET_FILE_TYPE", "This file type can't be used for a design.", HttpStatus.UNSUPPORTED_MEDIA_TYPE, { filename: safeFilename(input.filename) });
    if (!Number.isInteger(input.fileSizeBytes) || input.fileSizeBytes <= 0 || input.fileSizeBytes > SET_PET_FILE_MAX_BYTES) {
      throw new ApiException("SET_PET_FILE_TOO_LARGE", "This file is larger than allowed.", HttpStatus.PAYLOAD_TOO_LARGE, { maxBytes: SET_PET_FILE_MAX_BYTES });
    }
    await this.removeStaleLooseFiles(userId);
    const loose = await this.prisma.setPetDesignFile.count({ where: { userId, requestId: null, status: { not: SetPetDesignFileStatus.REJECTED } } });
    if (loose >= SET_PET_MAX_LOOSE_FILES) throw new ApiException("SET_PET_TOO_MANY_FILES", "Remove an unused design before uploading another.", HttpStatus.CONFLICT, { max: SET_PET_MAX_LOOSE_FILES });

    const objectKey = `set-pet-designs/${userId}/${randomUUID()}.${claim.keyExtension}`;
    const target = await this.storage.createSetPetDesignUploadTarget(objectKey, claim.storedContentType, input.fileSizeBytes);
    const file = await this.prisma.setPetDesignFile.create({ data: {
      userId, objectKey, mimeType: MIME_OF[claim.kind], fileSizeBytes: input.fileSizeBytes, originalFilename: safeFilename(input.filename),
    } });
    return { file: toSetPetDesignFileDto(file), uploadUrl: target.uploadUrl, method: target.method, headers: target.headers, expiresInSeconds: target.expiresInSeconds };
  }

  /**
   * After the browser's PUT: the bytes must be what the name claimed (magic bytes), within the size, and raster
   * images are stripped of EXIF/XMP and written back. Anything else is deleted and the file marked REJECTED.
   */
  async complete(userId: string, fileId: string): Promise<SetPetDesignFileDto> {
    const file = await this.ownFile(userId, fileId);
    if (file.status === SetPetDesignFileStatus.READY) return toSetPetDesignFileDto(file);
    if (file.status === SetPetDesignFileStatus.REJECTED) throw this.rejected(file.rejectReason ?? "REJECTED");
    const claimed = KIND_BY_EXTENSION[file.objectKey.split(".").pop() ?? ""];
    if (!claimed) return this.reject(file, "TYPE_NOT_ALLOWED");

    let body: Buffer;
    try {
      body = await this.readObject(file.objectKey, claimed);
    } catch (e) {
      if (e instanceof TooLargeError) return this.reject(file, "TOO_LARGE");
      throw new ApiException("SET_PET_FILE_NOT_UPLOADED", "The file has not arrived yet.", HttpStatus.CONFLICT);
    }
    const size = body.length;
    const actual = detectKind(body.subarray(0, HEAD_BYTES), claimed);
    if (!actual) return this.reject(file, "CONTENT_DOES_NOT_MATCH_TYPE");
    const fullSize = (body as Buffer & { totalLength?: number }).totalLength ?? size;
    if (fullSize > file.fileSizeBytes || fullSize > SET_PET_FILE_MAX_BYTES) return this.reject(file, "TOO_LARGE");

    let stored = fullSize;
    if (actual === "jpeg" || actual === "png" || actual === "webp" || actual === "heic") {
      const cleaned = stripMetadata(body, actual);
      if (!cleaned) return this.reject(file, "COULD_NOT_REMOVE_METADATA");
      if (!cleaned.equals(body)) await this.storage.putSetPetDesign(file.objectKey, cleaned, isPreviewable(actual) ? MIME_OF[actual] : "application/octet-stream");
      stored = cleaned.length;
    }
    const ready = await this.prisma.setPetDesignFile.update({ where: { id: file.id }, data: {
      status: SetPetDesignFileStatus.READY, mimeType: MIME_OF[actual], fileSizeBytes: stored, previewable: isPreviewable(actual), uploadedAt: new Date(),
    } });
    return toSetPetDesignFileDto(ready);
  }

  async listLooseFiles(userId: string): Promise<SetPetDesignFileDto[]> {
    const rows = await this.prisma.setPetDesignFile.findMany({ where: { userId, requestId: null, status: { not: SetPetDesignFileStatus.REJECTED } }, orderBy: { createdAt: "asc" } });
    return rows.map(toSetPetDesignFileDto);
  }

  /** Removes an upload the member no longer wants; only while it is not on a request. */
  async removeFile(userId: string, fileId: string): Promise<{ id: string; removed: true }> {
    const file = await this.ownFile(userId, fileId);
    if (file.requestId) throw new ApiException("SET_PET_FILE_IN_USE", "This design is part of a request.", HttpStatus.CONFLICT);
    const removed = await this.prisma.setPetDesignFile.deleteMany({ where: { id: file.id, userId, requestId: null } });
    if (!removed.count) throw new ApiException("SET_PET_FILE_IN_USE", "This design is part of a request.", HttpStatus.CONFLICT);
    await this.storage.deletePrivateObject(file.objectKey).catch(() => undefined);
    return { id: file.id, removed: true };
  }

  /** A short-lived signed URL to the owner's own checked JPEG/PNG/WebP; print files and HEIC are never previewed. */
  async preview(userId: string, fileId: string) {
    const file = await this.ownFile(userId, fileId);
    if (file.status !== SetPetDesignFileStatus.READY || !file.previewable) throw new NotFoundApiException("Set Pet design preview");
    const target = await this.storage.createPrivateDownloadTarget(file.objectKey);
    return { url: target.downloadUrl, expiresInSeconds: target.expiresInSeconds };
  }

  // ------------------------------------------------------------------------------------------------ requests

  async create(userId: string, input: CreateSetPetRequestInput): Promise<SetPetRequestDto> {
    const zones = input.placements.map((p) => p.zone);
    if (!zones.length) throw new ValidationApiException({ field: "placements", reason: "AT_LEAST_ONE_ZONE" });
    if (new Set(zones).size !== zones.length) throw new ValidationApiException({ field: "placements", reason: "ONE_DESIGN_PER_ZONE" });
    const designIds = [...new Set(input.placements.map((p) => p.designFileId))];
    if (designIds.length > SET_PET_MAX_DESIGNS) throw new ValidationApiException({ field: "placements", reason: "TOO_MANY_DESIGNS", max: SET_PET_MAX_DESIGNS });
    if (!input.humanSizes.length || input.humanSizes.length > SET_PET_MAX_HUMAN_GARMENTS) throw new ValidationApiException({ field: "humanSizes", reason: "COUNT", max: SET_PET_MAX_HUMAN_GARMENTS });
    for (const [field, range] of Object.entries(SET_PET_MEASUREMENT_RANGES) as Array<[keyof typeof SET_PET_MEASUREMENT_RANGES, { min: number; max: number }]>) {
      const value = input.petMeasurements[field];
      if (!Number.isFinite(value) || value < range.min || value > range.max) throw new ValidationApiException({ field: `petMeasurements.${field}`, reason: "OUT_OF_RANGE", min: range.min, max: range.max });
    }
    if (input.petId && !(await this.petAccess.findAccessiblePet(input.petId, userId))) throw new NotFoundApiException("Pet");
    const open = await this.prisma.setPetRequest.count({ where: { userId, status: { in: MEMBER_CANCELLABLE } } });
    if (open >= SET_PET_MAX_OPEN_REQUESTS) throw new ApiException("SET_PET_TOO_MANY_OPEN", "You already have requests waiting; finish or cancel one first.", HttpStatus.CONFLICT, { max: SET_PET_MAX_OPEN_REQUESTS });

    const { id, dispatch } = await this.prisma.$transaction(async (tx) => {
      const request = await tx.setPetRequest.create({ data: {
        userId, petId: input.petId ?? null,
        humanColour: input.humanColour.trim(), humanSizes: input.humanSizes, petSize: input.petSize, petColour: input.petColour.trim(),
        petNeckCm: input.petMeasurements.neckCm, petChestCm: input.petMeasurements.chestCm, petBackLengthCm: input.petMeasurements.backLengthCm, petWeightKg: input.petMeasurements.weightKg,
        notes: input.notes?.trim() || null,
        events: { create: { toStatus: SetPetRequestStatus.SUBMITTED, actor: SetPetActor.MEMBER, actorUserId: userId } },
      } });
      // The designs must be the caller's own, checked, and not on another request — claimed in one conditional write.
      const claimed = await tx.setPetDesignFile.updateMany({ where: { id: { in: designIds }, userId, status: SetPetDesignFileStatus.READY, requestId: null }, data: { requestId: request.id } });
      if (claimed.count !== designIds.length) throw new ApiException("SET_PET_DESIGN_UNAVAILABLE", "A design is missing, not checked yet, or already used.", HttpStatus.CONFLICT);
      await tx.setPetPlacement.createMany({ data: input.placements.map((p) => ({ requestId: request.id, zone: p.zone, designFileId: p.designFileId })) });
      const dispatch = await this.events.stage("SetPetRequestSubmitted", { requestId: request.id, number: request.number, userId, designCount: designIds.length, zones }, { tx, aggregateType: "SetPetRequest", aggregateId: request.id });
      return { id: request.id, dispatch };
    });
    await dispatch();
    return this.get(userId, id);
  }

  async list(userId: string): Promise<SetPetRequestDto[]> {
    const rows = await this.prisma.setPetRequest.findMany({ where: { userId }, include: REQUEST_INCLUDE, orderBy: { createdAt: "desc" }, take: 50 });
    return rows.map(toSetPetRequestDto);
  }

  async get(userId: string, id: string): Promise<SetPetRequestDto> {
    const row = await this.prisma.setPetRequest.findFirst({ where: { id, userId }, include: REQUEST_INCLUDE });
    if (!row) throw new NotFoundApiException("Set Pet request");
    return toSetPetRequestDto(row);
  }

  /** The member may cancel until they accept a quote; after that production may have started, so staff decide. */
  async cancel(userId: string, id: string, reason?: string): Promise<SetPetRequestDto> {
    const current = await this.ownRequest(userId, id);
    const note = reason?.trim() || null;
    const dispatch = await this.prisma.$transaction(async (tx) => {
      const moved = await tx.setPetRequest.updateMany({ where: { id, userId, status: { in: MEMBER_CANCELLABLE } }, data: { status: SetPetRequestStatus.CANCELLED, cancelledAt: new Date(), cancelledBy: SetPetActor.MEMBER, cancelReason: note } });
      if (!moved.count) throw new ApiException("SET_PET_NOT_CANCELLABLE", "This request can no longer be cancelled here; contact support.", HttpStatus.CONFLICT, { status: current.status });
      await tx.setPetRequestEvent.create({ data: { requestId: id, fromStatus: current.status, toStatus: SetPetRequestStatus.CANCELLED, actor: SetPetActor.MEMBER, actorUserId: userId, note } });
      return this.events.stage("SetPetRequestCancelled", { requestId: id, userId, by: "MEMBER", fromStatus: current.status }, { tx, aggregateType: "SetPetRequest", aggregateId: id });
    });
    await dispatch();
    return this.get(userId, id);
  }

  /**
   * Accepting staff's quote confirms the order (payment is settled separately, later). With `seenAmountIrr` the member
   * accepts exactly the price they saw: if staff revised the quote meanwhile, nothing changes and they see the new one.
   */
  async acceptQuote(userId: string, id: string, seenAmountIrr?: number): Promise<SetPetRequestDto> {
    const current = await this.ownRequest(userId, id);
    const dispatch = await this.prisma.$transaction(async (tx) => {
      const moved = await tx.setPetRequest.updateMany({ where: { id, userId, status: SetPetRequestStatus.QUOTED, quoteAmountIrr: seenAmountIrr === undefined ? { not: null } : seenAmountIrr }, data: { status: SetPetRequestStatus.CONFIRMED, confirmedAt: new Date() } });
      if (!moved.count) {
        if (current.status === SetPetRequestStatus.QUOTED && seenAmountIrr !== undefined && current.quoteAmountIrr !== seenAmountIrr) {
          throw new ApiException("SET_PET_QUOTE_CHANGED", "The quote has changed; please review the new price.", HttpStatus.CONFLICT, { amountIrr: current.quoteAmountIrr });
        }
        throw new ApiException("SET_PET_NO_QUOTE", "There is no quote to accept.", HttpStatus.CONFLICT, { status: current.status });
      }
      await tx.setPetRequestEvent.create({ data: { requestId: id, fromStatus: SetPetRequestStatus.QUOTED, toStatus: SetPetRequestStatus.CONFIRMED, actor: SetPetActor.MEMBER, actorUserId: userId } });
      return this.events.stage("SetPetQuoteAccepted", { requestId: id, userId, amountIrr: current.quoteAmountIrr }, { tx, aggregateType: "SetPetRequest", aggregateId: id });
    });
    await dispatch();
    return this.get(userId, id);
  }

  // ------------------------------------------------------------------------------------------------ helpers

  private async ownFile(userId: string, fileId: string) {
    const file = await this.prisma.setPetDesignFile.findFirst({ where: { id: fileId, userId } });
    if (!file) throw new NotFoundApiException("Set Pet design");
    return file;
  }

  private async ownRequest(userId: string, id: string) {
    const row = await this.prisma.setPetRequest.findFirst({ where: { id, userId }, select: { id: true, status: true, quoteAmountIrr: true } });
    if (!row) throw new NotFoundApiException("Set Pet request");
    return row;
  }

  private rejected(reason: string) {
    return new ApiException("SET_PET_FILE_REJECTED", "This file can't be used as a design.", HttpStatus.UNPROCESSABLE_ENTITY, { reason });
  }

  private async reject(file: SetPetDesignFile, reason: string): Promise<never> {
    await this.prisma.setPetDesignFile.update({ where: { id: file.id }, data: { status: SetPetDesignFileStatus.REJECTED, rejectReason: reason } });
    await this.storage.deletePrivateObject(file.objectKey).catch((e) => this.logger.warn(`Could not delete rejected design ${file.id}: ${e instanceof Error ? e.message : e}`));
    throw this.rejected(reason);
  }

  /**
   * Reads the uploaded object, never more than the size cap. Raster images and HEIC are kept whole (to be cleaned);
   * print files only need their first bytes, the rest is counted, not kept.
   */
  private async readObject(key: string, claimed: SetPetFileKind): Promise<Buffer> {
    const { body } = await this.storage.openSetPetDesign(key);
    const keepAll = ["jpeg", "png", "webp", "heic"].includes(claimed);
    const chunks: Buffer[] = [];
    let total = 0;
    let kept = 0;
    for await (const chunk of body as AsyncIterable<Buffer | string>) {
      const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      total += buffer.length;
      if (total > SET_PET_FILE_MAX_BYTES) {
        (body as { destroy?: () => void }).destroy?.();
        throw new TooLargeError();
      }
      if (keepAll || kept < HEAD_BYTES) {
        chunks.push(buffer);
        kept += buffer.length;
      }
    }
    const bytes = Buffer.concat(chunks);
    return Object.assign(bytes, { totalLength: total });
  }

  /** Unplaced uploads the member left behind for a week, and rejected ones: rows and objects go. */
  private async removeStaleLooseFiles(userId: string) {
    const stale = await this.prisma.setPetDesignFile.findMany({ where: { userId, requestId: null, OR: [{ status: SetPetDesignFileStatus.REJECTED }, { createdAt: { lt: new Date(Date.now() - LOOSE_FILE_TTL_MS) } }] }, select: { id: true, objectKey: true }, take: 50 });
    if (!stale.length) return;
    await this.prisma.setPetDesignFile.deleteMany({ where: { id: { in: stale.map((f) => f.id) }, requestId: null } });
    await Promise.all(stale.map((f) => this.storage.deletePrivateObject(f.objectKey).catch(() => undefined)));
  }
}

class TooLargeError extends Error {}
