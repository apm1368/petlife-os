import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import {
  LedgerAccountCode,
  LedgerEntryDirection,
  PetLifecycleStatus,
  PetSpecies,
  Prisma,
  SetPetActor,
  SetPetDesignFileStatus,
  SetPetProofStatus,
  SetPetRequestStatus,
  ShippingProvider,
  WalletBalanceType,
  WalletCreditSource,
  type SetPetDesignFile,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  SET_PET_ACCEPTED_EXTENSIONS,
  SET_PET_COLOURS,
  SET_PET_EDITABLE_STATUSES,
  SET_PET_FONTS,
  SET_PET_GARMENTS,
  SET_PET_LIMITS,
  SET_PET_MEMBER_CANCELLABLE,
  SET_PET_SIZES,
  SET_PET_ZONES,
  SET_PET_ZONE_KEYS,
  priceSetPet,
  setPetWearerOf,
  type AddressSnapshotDto,
  type SetPetDesignFileDto,
  type SetPetDraftDto,
  type SetPetOptionsDto,
  type SetPetOrderInput,
  type SetPetPayInput,
  type SetPetPrice,
  type SetPetPriceTable,
  type SetPetRequestDto,
  type SetPetShippingOptionDto,
  type SetPetUploadTargetDto,
  type SetPetZone,
} from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ApiException, NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { StorageService } from "../storage/storage.service";
import { PetAccessService } from "../pet-access/pet-access.service";
import { WalletService } from "../commerce/payments/wallet.service";
import { LedgerService } from "../commerce/ledger/ledger.service";
import { courierConfigUsable, parseCourierConfig, parsePostConfig, postConfigUsable, quoteCourier, quotePost } from "../commerce/logistics/shipping-pricing.policy";
import {
  claimedKind,
  detectKind,
  isPreviewable,
  MIME_OF,
  rasterSize,
  safeFilename,
  SET_PET_FILE_MAX_BYTES,
  SET_PET_MAX_DESIGNS,
  SET_PET_MAX_LOOSE_FILES,
  stripMetadata,
  type SetPetFileKind,
} from "./set-pet-files";

/** Orders not yet shipped or cancelled at once, per member — generous, but not unbounded. */
export const SET_PET_MAX_OPEN_REQUESTS = 5;
/** The auto-saved draft is the builder's state, not files: a few kilobytes; anything bigger is refused. */
export const SET_PET_DRAFT_MAX_BYTES = 64 * 1024;
/** Wallet entries and ledger rows of a Set Pet payment or refund point at the order with these reference types. */
export const SET_PET_PAYMENT_REFERENCE = "SET_PET_ORDER";
export const SET_PET_REFUND_REFERENCE = "SET_PET_ORDER_REFUND";
/** Unplaced uploads older than this are removed when the member next uploads. */
const LOOSE_FILE_TTL_MS = 14 * 24 * 3600e3;
const HEAD_BYTES = 4096;
const OPEN_STATUSES: SetPetRequestStatus[] = ["SUBMITTED", "NEEDS_NEW_DESIGN", "PROOF_SENT", "AWAITING_PAYMENT", "PAID", "IN_PRODUCTION"];
/** Shipping is by the shop's own methods (owner F7): the ones staff run by hand and price in shop settings. */
const SET_PET_SHIPPING: ShippingProvider[] = [ShippingProvider.OPETLIFE_COURIER, ShippingProvider.SNAPPBOX_APP, ShippingProvider.ALOPEYK_APP, ShippingProvider.POST_PISHTAZ];
/** A boxed garment weighs about this much (for Post's per-kilo price). */
const GRAMS_PER_GARMENT = 350;
const MEMORIAL_STATUSES: PetLifecycleStatus[] = [PetLifecycleStatus.LOST, PetLifecycleStatus.DECEASED, PetLifecycleStatus.MEMORIAL];

const KIND_BY_EXTENSION: Record<string, SetPetFileKind> = { jpg: "jpeg", png: "png", webp: "webp", heic: "heic", pdf: "pdf", svg: "svg", ai: "ai", psd: "psd" };

const REQUEST_INCLUDE = {
  items: { orderBy: { position: "asc" } },
  placements: { include: { designFile: true } },
  proofs: { orderBy: { createdAt: "desc" } },
  events: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.SetPetRequestInclude;
type RequestRow = Prisma.SetPetRequestGetPayload<{ include: typeof REQUEST_INCLUDE }>;

/** How staff download a design: always as an attachment, and print files as opaque bytes (an SVG can carry script). */
export function setPetDesignDownloadOptions(file: Pick<SetPetDesignFile, "objectKey" | "mimeType" | "previewable" | "originalFilename">) {
  const extension = file.objectKey.split(".").pop() ?? "bin";
  return { filename: file.originalFilename ?? `design.${extension}`, contentType: file.previewable ? file.mimeType : "application/octet-stream" };
}

export function setPetReference(number: number) {
  return `SP-${String(number).padStart(6, "0")}`;
}

/** Iran's working week: Saturday to Thursday; Friday is the weekend (Tehran time). */
export function addWorkingDays(from: Date, days: number): Date {
  const tehranOffsetMs = 3.5 * 3600e3;
  const at = new Date(from.getTime());
  let left = days;
  while (left > 0) {
    at.setTime(at.getTime() + 24 * 3600e3);
    if (new Date(at.getTime() + tehranOffsetMs).getUTCDay() !== 5) left--;
  }
  return at;
}

export function toSetPetDesignFileDto(file: SetPetDesignFile): SetPetDesignFileDto {
  return {
    id: file.id,
    status: file.status,
    mimeType: file.mimeType,
    fileSizeBytes: file.fileSizeBytes,
    originalFilename: file.originalFilename,
    previewable: file.previewable,
    widthPx: file.widthPx,
    heightPx: file.heightPx,
    rejectReason: file.rejectReason,
    createdAt: file.createdAt.toISOString(),
  };
}

export function readPriceTable(row: { garmentPricesIrr: Prisma.JsonValue; zonePricesIrr: Prisma.JsonValue; setDiscountPercent: number } | null): SetPetPriceTable {
  const pick = <K extends string>(raw: Prisma.JsonValue | undefined, keys: readonly K[]) => {
    const out: Partial<Record<K, number>> = {};
    const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    for (const key of keys) {
      const v = obj[key];
      if (typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 2_000_000_000) out[key] = v;
    }
    return out;
  };
  return {
    garmentPricesIrr: pick(row?.garmentPricesIrr, SET_PET_GARMENTS),
    zonePricesIrr: pick(row?.zonePricesIrr, SET_PET_ZONE_KEYS),
    setDiscountPercent: Math.min(Math.max(row?.setDiscountPercent ?? 0, 0), 90),
  };
}

/** Every garment and every zone has a price: only then can members send orders. */
export function priceTableReady(table: SetPetPriceTable): boolean {
  return SET_PET_GARMENTS.every((g) => (table.garmentPricesIrr[g] ?? 0) > 0) && SET_PET_ZONE_KEYS.every((z) => (table.zonePricesIrr[z] ?? 0) > 0);
}

/** The member's view of an order: never the staff-only note, which admin did what, or the delivery address back. */
export function toSetPetRequestDto(row: RequestRow): SetPetRequestDto {
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  const proof = row.proofs.find((p) => p.status === SetPetProofStatus.SENT || p.status === SetPetProofStatus.APPROVED) ?? null;
  const designs = new Map<string, SetPetDesignFile>();
  for (const p of row.placements) if (p.designFile) designs.set(p.designFile.id, p.designFile);
  const lines = (row.priceLines as unknown as SetPetPrice["lines"]) ?? [];
  return {
    id: row.id,
    number: row.number,
    reference: setPetReference(row.number),
    status: row.status,
    items: row.items.map((i) => ({ position: i.position, garment: i.garment, size: i.size, colour: i.colour, petId: i.petId, petName: i.petName, petSpecies: i.petSpecies === "DOG" || i.petSpecies === "CAT" ? i.petSpecies : null })),
    placements: SET_PET_ZONE_KEYS.flatMap((zone) => row.placements.filter((p) => p.zone === zone)).map((p) => ({
      zone: p.zone, designFileId: p.designFileId, text: p.text, font: p.font, textColour: p.textColour,
      scale: Number(p.scale), offsetX: Number(p.offsetX), offsetY: Number(p.offsetY),
    })),
    designs: [...designs.values()].map(toSetPetDesignFileDto),
    forPetId: row.forPetId,
    notes: row.notes,
    price: { lines, subtotalIrr: row.subtotalIrr, discountPercent: row.discountPercent, discountIrr: row.discountIrr, totalIrr: row.itemsTotalIrr },
    proof: proof ? { id: proof.id, status: proof.status === SetPetProofStatus.APPROVED ? "APPROVED" : "SENT", note: proof.note, petPrintWidthCm: proof.petPrintWidthCm, petPrintHeightCm: proof.petPrintHeightCm, sentAt: iso(proof.sentAt) } : null,
    designRejectReason: row.status === SetPetRequestStatus.NEEDS_NEW_DESIGN ? row.designRejectReason : null,
    payment: row.paidAt ? { shippingProvider: row.shippingProvider, shippingIrr: row.shippingIrr, totalPaidIrr: row.totalPaidIrr, paidAt: iso(row.paidAt) } : null,
    estimatedReadyAt: iso(row.estimatedReadyAt),
    productionStartedAt: iso(row.productionStartedAt),
    shippedAt: iso(row.shippedAt),
    shippingNote: row.shippingNote,
    cancelledAt: iso(row.cancelledAt),
    cancelledBy: row.cancelledBy,
    cancelReason: row.cancelReason,
    refundedIrr: row.refundedIrr,
    canEdit: SET_PET_EDITABLE_STATUSES.includes(row.status),
    canCancel: SET_PET_MEMBER_CANCELLABLE.includes(row.status),
    timeline: row.events.map((e) => ({ fromStatus: e.fromStatus, toStatus: e.toStatus, actor: e.actor, note: e.note, at: e.createdAt.toISOString() })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

interface CheckedOrder {
  items: Array<Omit<Prisma.SetPetItemCreateManyInput, "requestId">>;
  placements: Array<Omit<Prisma.SetPetPlacementCreateManyInput, "requestId">>;
  forPetId: string | null;
  notes: string | null;
  price: SetPetPrice;
  zones: SetPetZone[];
}

/**
 * «ست پت» for members (owner's #368 answers): upload designs (private), keep an auto-saved draft, send an order priced
 * from the fixed table, edit it until the proof is approved, approve the proof, pay from the wallet, cancel free until
 * printing starts (a paid order is refunded to the wallet), reorder in one click. Every read and write is scoped to the
 * caller's own rows; someone else's id is a plain 404.
 */
@Injectable()
export class SetPetService {
  private readonly logger = new Logger(SetPetService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly events: DomainEventsService,
    private readonly petAccess: PetAccessService,
    private readonly wallet: WalletService,
    private readonly ledger: LedgerService,
  ) {}

  async settings() {
    return this.prisma.setPetSettings.findUnique({ where: { id: "default" } });
  }

  async priceTable(): Promise<SetPetPriceTable> {
    return readPriceTable(await this.settings());
  }

  async options(): Promise<SetPetOptionsDto> {
    const settings = await this.settings();
    const prices = readPriceTable(settings);
    return {
      sizes: SET_PET_SIZES,
      garments: SET_PET_GARMENTS,
      colours: { ...SET_PET_COLOURS },
      fonts: SET_PET_FONTS,
      zones: SET_PET_ZONE_KEYS.map((zone) => ({ zone, wearer: SET_PET_ZONES[zone].wearer, widthCm: SET_PET_ZONES[zone].widthCm, heightCm: SET_PET_ZONES[zone].heightCm })),
      acceptedExtensions: SET_PET_ACCEPTED_EXTENSIONS,
      limits: SET_PET_LIMITS,
      prices,
      pricesReady: priceTableReady(prices),
      productionWorkingDays: settings?.productionWorkingDays ?? 5,
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
    const loose = await this.prisma.setPetDesignFile.count({ where: { userId, placements: { none: {} }, status: { not: SetPetDesignFileStatus.REJECTED } } });
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
    let dims: { width: number; height: number } | null = null;
    if (actual === "jpeg" || actual === "png" || actual === "webp" || actual === "heic") {
      const cleaned = stripMetadata(body, actual);
      if (!cleaned) return this.reject(file, "COULD_NOT_REMOVE_METADATA");
      if (!cleaned.equals(body)) await this.storage.putSetPetDesign(file.objectKey, cleaned, isPreviewable(actual) ? MIME_OF[actual] : "application/octet-stream");
      stored = cleaned.length;
      dims = rasterSize(cleaned, actual);
    }
    const ready = await this.prisma.setPetDesignFile.update({ where: { id: file.id }, data: {
      status: SetPetDesignFileStatus.READY, mimeType: MIME_OF[actual], fileSizeBytes: stored, previewable: isPreviewable(actual), uploadedAt: new Date(),
      widthPx: dims?.width ?? null, heightPx: dims?.height ?? null,
    } });
    return toSetPetDesignFileDto(ready);
  }

  /** The member's checked designs, newest first: unplaced ones and those on their orders (reusable on a new order). */
  async listFiles(userId: string): Promise<SetPetDesignFileDto[]> {
    const rows = await this.prisma.setPetDesignFile.findMany({ where: { userId, status: SetPetDesignFileStatus.READY }, orderBy: { createdAt: "desc" }, take: 60 });
    return rows.map(toSetPetDesignFileDto);
  }

  /** Removes an upload the member no longer wants; only while no order prints it. */
  async removeFile(userId: string, fileId: string): Promise<{ id: string; removed: true }> {
    const file = await this.ownFile(userId, fileId);
    const removed = await this.prisma.setPetDesignFile.deleteMany({ where: { id: file.id, userId, placements: { none: {} } } });
    if (!removed.count) throw new ApiException("SET_PET_FILE_IN_USE", "This design is part of an order.", HttpStatus.CONFLICT);
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

  // ------------------------------------------------------------------------------------------------ draft (P5)

  async getDraft(userId: string): Promise<SetPetDraftDto | null> {
    const row = await this.prisma.setPetDraft.findUnique({ where: { userId } });
    return row ? { data: row.data as Record<string, unknown>, updatedAt: row.updatedAt.toISOString() } : null;
  }

  async saveDraft(userId: string, data: unknown): Promise<SetPetDraftDto> {
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new ValidationApiException({ field: "data", reason: "OBJECT_REQUIRED" });
    if (Buffer.byteLength(JSON.stringify(data), "utf8") > SET_PET_DRAFT_MAX_BYTES) throw new ValidationApiException({ field: "data", reason: "TOO_LARGE", maxBytes: SET_PET_DRAFT_MAX_BYTES });
    const json = data as Prisma.InputJsonObject;
    const row = await this.prisma.setPetDraft.upsert({ where: { userId }, create: { userId, data: json }, update: { data: json } });
    return { data: row.data as Record<string, unknown>, updatedAt: row.updatedAt.toISOString() };
  }

  async deleteDraft(userId: string): Promise<{ removed: true }> {
    await this.prisma.setPetDraft.deleteMany({ where: { userId } });
    return { removed: true };
  }

  // ------------------------------------------------------------------------------------------------ orders

  /** Checks an order against the owner's rules and prices it from the fixed table. Throws a field error on the first problem. */
  private async check(userId: string, input: SetPetOrderInput): Promise<CheckedOrder> {
    const items = input.items ?? [];
    for (const [position, item] of items.entries()) {
      if (!(SET_PET_GARMENTS as readonly string[]).includes(item.garment)) throw new ValidationApiException({ field: `items.${position}.garment`, reason: "UNKNOWN" });
      if (!(SET_PET_SIZES as readonly string[]).includes(item.size)) throw new ValidationApiException({ field: `items.${position}.size`, reason: "UNKNOWN" });
      if (!Object.hasOwn(SET_PET_COLOURS, item.colour)) throw new ValidationApiException({ field: `items.${position}.colour`, reason: "UNKNOWN" });
    }
    const humans = items.filter((i) => setPetWearerOf(i.garment) === "HUMAN");
    const pets = items.filter((i) => setPetWearerOf(i.garment) === "PET");
    if (humans.length < 1 || humans.length > SET_PET_LIMITS.maxHumanGarments) throw new ValidationApiException({ field: "items", reason: "HUMAN_GARMENT_COUNT", min: 1, max: SET_PET_LIMITS.maxHumanGarments });
    if (pets.length > SET_PET_LIMITS.maxPetGarments) throw new ValidationApiException({ field: "items", reason: "PET_GARMENT_COUNT", max: SET_PET_LIMITS.maxPetGarments });

    // Owner P8: a pet that is with the member gets its garment in the set; a human-only set is only for a pet that is
    // lost or has died.
    let forPetId: string | null = null;
    if (!pets.length) {
      if (!input.forPetId) throw new ValidationApiException({ field: "items", reason: "PET_GARMENT_REQUIRED" });
      if (!(await this.petAccess.findAccessiblePet(input.forPetId, userId))) throw new NotFoundApiException("Pet");
      const row = await this.prisma.pet.findUnique({ where: { id: input.forPetId }, select: { lifecycleStatus: true } });
      if (!row || !MEMORIAL_STATUSES.includes(row.lifecycleStatus)) throw new ValidationApiException({ field: "items", reason: "PET_GARMENT_REQUIRED" });
      forPetId = input.forPetId;
    }

    const petIds = [...new Set(pets.map((p) => p.petId).filter((id): id is string => !!id))];
    const profilePets = new Map<string, PetSpecies>();
    for (const petId of petIds) {
      if (!(await this.petAccess.findAccessiblePet(petId, userId))) throw new NotFoundApiException("Pet");
      const row = await this.prisma.pet.findUnique({ where: { id: petId }, select: { species: true, deletedAt: true } });
      if (!row || row.deletedAt) throw new NotFoundApiException("Pet");
      if (row.species !== PetSpecies.DOG && row.species !== PetSpecies.CAT) throw new ValidationApiException({ field: "items", reason: "DOGS_AND_CATS_ONLY" });
      profilePets.set(petId, row.species);
    }

    const checkedItems = items.map((item, position): CheckedOrder["items"][number] => {
      const base = { position, garment: item.garment, size: item.size, colour: item.colour };
      if (setPetWearerOf(item.garment) === "HUMAN") return { ...base, petId: null, petName: null, petSpecies: null };
      if (item.petId) return { ...base, petId: item.petId, petName: null, petSpecies: profilePets.get(item.petId) ?? null };
      const name = cleanText(item.petName ?? "", 40);
      if (!name) throw new ValidationApiException({ field: `items.${position}.petName`, reason: "REQUIRED" });
      if (item.petSpecies !== "DOG" && item.petSpecies !== "CAT") throw new ValidationApiException({ field: `items.${position}.petSpecies`, reason: "DOGS_AND_CATS_ONLY" });
      return { ...base, petId: null, petName: name, petSpecies: item.petSpecies };
    });

    const placements = input.placements ?? [];
    if (!placements.length) throw new ValidationApiException({ field: "placements", reason: "AT_LEAST_ONE_ZONE" });
    const zones = placements.map((p) => p.zone);
    if (new Set(zones).size !== zones.length) throw new ValidationApiException({ field: "placements", reason: "ONE_PRINT_PER_ZONE" });
    const designIds = [...new Set(placements.map((p) => p.designFileId).filter((id): id is string => !!id))];
    if (designIds.length > SET_PET_MAX_DESIGNS) throw new ValidationApiException({ field: "placements", reason: "TOO_MANY_DESIGNS", max: SET_PET_MAX_DESIGNS });
    if (designIds.length) {
      const ready = await this.prisma.setPetDesignFile.count({ where: { id: { in: designIds }, userId, status: SetPetDesignFileStatus.READY } });
      if (ready !== designIds.length) throw new ApiException("SET_PET_DESIGN_UNAVAILABLE", "A design is missing or not checked yet.", HttpStatus.CONFLICT);
    }
    const checkedPlacements = placements.map((p, index): CheckedOrder["placements"][number] => {
      const field = `placements.${index}`;
      if (!Object.hasOwn(SET_PET_ZONES, p.zone)) throw new ValidationApiException({ field: `${field}.zone`, reason: "UNKNOWN" });
      const wearer = SET_PET_ZONES[p.zone].wearer;
      if (!items.some((i) => setPetWearerOf(i.garment) === wearer)) throw new ValidationApiException({ field: `${field}.zone`, reason: "NO_GARMENT_FOR_ZONE" });
      const scale = p.scale ?? 1;
      const offsetX = p.offsetX ?? 0;
      const offsetY = p.offsetY ?? 0;
      if (!Number.isFinite(scale) || scale < SET_PET_LIMITS.minScale || scale > SET_PET_LIMITS.maxScale) throw new ValidationApiException({ field: `${field}.scale`, reason: "OUT_OF_RANGE" });
      if (![offsetX, offsetY].every((o) => Number.isFinite(o) && o >= -1 && o <= 1)) throw new ValidationApiException({ field: `${field}.offset`, reason: "OUT_OF_RANGE" });
      const transform = { scale: round(scale, 2), offsetX: round(offsetX, 3), offsetY: round(offsetY, 3) };
      if (p.designFileId) {
        if (p.text) throw new ValidationApiException({ field, reason: "DESIGN_OR_TEXT" });
        return { zone: p.zone, designFileId: p.designFileId, text: null, font: null, textColour: null, ...transform };
      }
      const text = cleanText(p.text ?? "", SET_PET_LIMITS.maxTextLength);
      if (!text) throw new ValidationApiException({ field, reason: "DESIGN_OR_TEXT" });
      if (!p.font || !(SET_PET_FONTS as readonly string[]).includes(p.font)) throw new ValidationApiException({ field: `${field}.font`, reason: "UNKNOWN" });
      const textColour = p.textColour ?? "black";
      if (!Object.hasOwn(SET_PET_COLOURS, textColour)) throw new ValidationApiException({ field: `${field}.textColour`, reason: "UNKNOWN" });
      return { zone: p.zone, designFileId: null, text, font: p.font, textColour, ...transform };
    });

    const notes = cleanText(input.notes ?? "", SET_PET_LIMITS.maxNotesLength, true) || null;
    const price = priceSetPet(await this.priceTable(), items, zones);
    if (price.unpriced.length) throw new ApiException("SET_PET_PRICES_NOT_SET", "Prices for Set Pet are not published yet.", HttpStatus.CONFLICT, { unpriced: price.unpriced });
    return { items: checkedItems, placements: checkedPlacements, forPetId, notes, price, zones };
  }

  private priceData(price: SetPetPrice) {
    return {
      priceLines: price.lines as unknown as Prisma.InputJsonArray,
      subtotalIrr: price.subtotalIrr,
      discountPercent: price.discountPercent,
      discountIrr: price.discountIrr,
      itemsTotalIrr: price.totalIrr,
    };
  }

  async create(userId: string, input: SetPetOrderInput & { reorderOfId?: string | null }): Promise<SetPetRequestDto> {
    const order = await this.check(userId, input);
    const open = await this.prisma.setPetRequest.count({ where: { userId, status: { in: OPEN_STATUSES } } });
    if (open >= SET_PET_MAX_OPEN_REQUESTS) throw new ApiException("SET_PET_TOO_MANY_OPEN", "You have several orders in progress; wait for one to finish or cancel one first.", HttpStatus.CONFLICT, { max: SET_PET_MAX_OPEN_REQUESTS });
    const reorderOfId = input.reorderOfId ? (await this.prisma.setPetRequest.findFirst({ where: { id: input.reorderOfId, userId }, select: { id: true } }))?.id ?? null : null;

    const { id, dispatch } = await this.prisma.$transaction(async (tx) => {
      const request = await tx.setPetRequest.create({ data: {
        userId, forPetId: order.forPetId, notes: order.notes, reorderOfId, ...this.priceData(order.price),
        events: { create: { toStatus: SetPetRequestStatus.SUBMITTED, actor: SetPetActor.MEMBER, actorUserId: userId } },
      } });
      await tx.setPetItem.createMany({ data: order.items.map((i) => ({ ...i, requestId: request.id })) });
      await tx.setPetPlacement.createMany({ data: order.placements.map((p) => ({ ...p, requestId: request.id })) });
      await tx.setPetDraft.deleteMany({ where: { userId } });
      const dispatch = await this.events.stage("SetPetRequestSubmitted", { requestId: request.id, number: request.number, userId, items: order.items.length, zones: order.zones, totalIrr: order.price.totalIrr }, { tx, aggregateType: "SetPetRequest", aggregateId: request.id });
      return { id: request.id, dispatch };
    });
    await dispatch();
    return this.get(userId, id);
  }

  /**
   * Owner P39: the member may change the order until they approve the proof. Any change sends it back to staff for a
   * new proof (a proof waiting for an answer is withdrawn), and the price is taken again from the current table.
   */
  async update(userId: string, id: string, input: SetPetOrderInput): Promise<SetPetRequestDto> {
    const current = await this.ownRequest(userId, id);
    if (!SET_PET_EDITABLE_STATUSES.includes(current.status)) throw new ApiException("SET_PET_NOT_EDITABLE", "This order can no longer be changed.", HttpStatus.CONFLICT, { status: current.status });
    const order = await this.check(userId, input);
    const dispatch = await this.prisma.$transaction(async (tx) => {
      const moved = await tx.setPetRequest.updateMany({
        where: { id, userId, status: current.status },
        data: { status: SetPetRequestStatus.SUBMITTED, forPetId: order.forPetId, notes: order.notes, designRejectReason: null, submittedAt: new Date(), ...this.priceData(order.price) },
      });
      if (!moved.count) throw new ApiException("SET_PET_CHANGED", "This order changed meanwhile; reload it.", HttpStatus.CONFLICT);
      await tx.setPetItem.deleteMany({ where: { requestId: id } });
      await tx.setPetPlacement.deleteMany({ where: { requestId: id } });
      await tx.setPetItem.createMany({ data: order.items.map((i) => ({ ...i, requestId: id })) });
      await tx.setPetPlacement.createMany({ data: order.placements.map((p) => ({ ...p, requestId: id })) });
      await tx.setPetProof.updateMany({ where: { requestId: id, status: SetPetProofStatus.SENT }, data: { status: SetPetProofStatus.SUPERSEDED, decidedAt: new Date() } });
      await tx.setPetRequestEvent.create({ data: { requestId: id, fromStatus: current.status, toStatus: SetPetRequestStatus.SUBMITTED, actor: SetPetActor.MEMBER, actorUserId: userId, note: "EDITED" } });
      return this.events.stage("SetPetRequestEdited", { requestId: id, userId, fromStatus: current.status, totalIrr: order.price.totalIrr }, { tx, aggregateType: "SetPetRequest", aggregateId: id });
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

  /** The proof image the member is asked to approve: their own order's current proof, through a short-lived link. */
  async proofPreview(userId: string, id: string) {
    const row = await this.prisma.setPetRequest.findFirst({ where: { id, userId }, select: { proofs: { where: { status: { in: [SetPetProofStatus.SENT, SetPetProofStatus.APPROVED] } }, orderBy: { createdAt: "desc" }, take: 1 } } });
    const proof = row?.proofs[0];
    if (!proof) throw new NotFoundApiException("Set Pet proof");
    const target = await this.storage.createPrivateDownloadTarget(proof.objectKey);
    return { url: target.downloadUrl, expiresInSeconds: target.expiresInSeconds };
  }

  /** Owner F2/F5: approving the proof locks the order and price; payment comes next. */
  async approveProof(userId: string, id: string, proofId: string): Promise<SetPetRequestDto> {
    const current = await this.ownRequest(userId, id);
    const dispatch = await this.prisma.$transaction(async (tx) => {
      const moved = await tx.setPetRequest.updateMany({ where: { id, userId, status: SetPetRequestStatus.PROOF_SENT }, data: { status: SetPetRequestStatus.AWAITING_PAYMENT, proofApprovedAt: new Date() } });
      const proof = moved.count ? await tx.setPetProof.updateMany({ where: { id: proofId, requestId: id, status: SetPetProofStatus.SENT }, data: { status: SetPetProofStatus.APPROVED, decidedAt: new Date() } }) : { count: 0 };
      if (!proof.count) throw new ApiException("SET_PET_PROOF_CHANGED", "This proof is no longer the one waiting for you; reload the order.", HttpStatus.CONFLICT, { status: current.status });
      await tx.setPetRequestEvent.create({ data: { requestId: id, fromStatus: SetPetRequestStatus.PROOF_SENT, toStatus: SetPetRequestStatus.AWAITING_PAYMENT, actor: SetPetActor.MEMBER, actorUserId: userId } });
      return this.events.stage("SetPetProofApproved", { requestId: id, userId, proofId }, { tx, aggregateType: "SetPetRequest", aggregateId: id });
    });
    await dispatch();
    return this.get(userId, id);
  }

  /** Delivery for a paid order: the shop's manual methods staff have switched on and priced, for this address. */
  async shippingOptions(userId: string, id: string, addressId: string): Promise<SetPetShippingOptionDto[]> {
    const order = await this.prisma.setPetRequest.findFirst({ where: { id, userId }, select: { id: true, _count: { select: { items: true } } } });
    if (!order) throw new NotFoundApiException("Set Pet request");
    const address = await this.ownAddress(userId, addressId);
    return this.quoteShipping(address, order._count.items);
  }

  private async quoteShipping(delivery: AddressSnapshotDto, garments: number): Promise<SetPetShippingOptionDto[]> {
    const [rows, settings] = await Promise.all([this.prisma.shippingMethodSetting.findMany({ where: { provider: { in: SET_PET_SHIPPING }, enabled: true } }), this.settings()]);
    const pickup: AddressSnapshotDto = {
      recipient: null, phone: null, addressLine: null, region: null, countryCode: "IR", instructions: null,
      city: settings?.workshopCity ?? null, latitude: settings?.workshopLatitude ?? null, longitude: settings?.workshopLongitude ?? null,
    };
    const out: SetPetShippingOptionDto[] = [];
    for (const provider of SET_PET_SHIPPING) {
      const row = rows.find((r) => r.provider === provider);
      if (!row) continue;
      if (provider === ShippingProvider.POST_PISHTAZ) {
        const config = parsePostConfig(row.config);
        const quote = postConfigUsable(config) ? quotePost(config, garments * GRAMS_PER_GARMENT) : null;
        if (quote) out.push({ provider, priceIrr: quote.priceIrr, etaDays: config.etaDaysMax });
      } else {
        const config = parseCourierConfig(row.config);
        // Couriers deliver within the workshop's city only; without it set, they are not offered.
        if (!courierConfigUsable(config) || !pickup.city) continue;
        const quote = quoteCourier(config, pickup, delivery);
        if (quote.available) out.push({ provider, priceIrr: quote.priceIrr, etaDays: 1 });
      }
    }
    return out;
  }

  /**
   * Owner F2/F3: full payment after the proof is approved, from the wallet (which card-to-card and the gateway top up).
   * The member pays exactly the total they saw; the status moves first (compare-and-set), then the wallet is debited,
   * all in one transaction, so a double click can never charge twice.
   */
  async pay(userId: string, id: string, input: Omit<SetPetPayInput, "idempotencyKey">): Promise<SetPetRequestDto> {
    const current = await this.prisma.setPetRequest.findFirst({ where: { id, userId }, select: { status: true, itemsTotalIrr: true, _count: { select: { items: true } } } });
    if (!current) throw new NotFoundApiException("Set Pet request");
    if (current.status === SetPetRequestStatus.PAID) return this.get(userId, id);
    if (current.status !== SetPetRequestStatus.AWAITING_PAYMENT) throw new ApiException("SET_PET_NOT_PAYABLE", "This order is not waiting for payment.", HttpStatus.CONFLICT, { status: current.status });
    const address = await this.ownAddress(userId, input.addressId);
    const option = (await this.quoteShipping(address, current._count.items)).find((o) => o.provider === input.shippingProvider);
    if (!option) throw new ValidationApiException({ field: "shippingProvider", reason: "NOT_AVAILABLE" });
    const total = current.itemsTotalIrr + option.priceIrr;
    if (total !== input.expectedTotalIrr) throw new ApiException("SET_PET_TOTAL_CHANGED", "The total has changed; please check it again.", HttpStatus.CONFLICT, { totalIrr: total });
    const settings = await this.settings();
    const now = new Date();
    const dispatch = await this.prisma.$transaction(async (tx) => {
      const moved = await tx.setPetRequest.updateMany({
        where: { id, userId, status: SetPetRequestStatus.AWAITING_PAYMENT, itemsTotalIrr: current.itemsTotalIrr },
        data: {
          status: SetPetRequestStatus.PAID, paidAt: now, totalPaidIrr: total, shippingIrr: option.priceIrr, shippingProvider: option.provider as ShippingProvider,
          shippingAddress: address as unknown as Prisma.InputJsonObject, estimatedReadyAt: addWorkingDays(now, settings?.productionWorkingDays ?? 5),
        },
      });
      if (!moved.count) throw new ApiException("SET_PET_CHANGED", "This order changed meanwhile; reload it.", HttpStatus.CONFLICT);
      const paid = await this.wallet.debitForPurchase({ userId, amount: total, referenceType: SET_PET_PAYMENT_REFERENCE, referenceId: id }, tx);
      // opetlife prints in-house (owner F6): the payment is platform revenue, not a seller payable.
      await this.ledger.recordBalanced("Set Pet order paid", SET_PET_PAYMENT_REFERENCE, id, "IRR", [
        { accountCode: LedgerAccountCode.CUSTOMER_PAYMENT_CLEARING, direction: LedgerEntryDirection.DEBIT, amount: total },
        { accountCode: LedgerAccountCode.PLATFORM_REVENUE, direction: LedgerEntryDirection.CREDIT, amount: total },
      ], tx);
      await tx.setPetRequest.update({ where: { id }, data: { paidWithdrawableIrr: paid.withdrawable, paidPurchaseOnlyIrr: paid.purchaseOnly } });
      await tx.setPetRequestEvent.create({ data: { requestId: id, fromStatus: SetPetRequestStatus.AWAITING_PAYMENT, toStatus: SetPetRequestStatus.PAID, actor: SetPetActor.MEMBER, actorUserId: userId } });
      return this.events.stage("SetPetRequestPaid", { requestId: id, userId, totalIrr: total }, { tx, aggregateType: "SetPetRequest", aggregateId: id });
    });
    await dispatch();
    return this.get(userId, id);
  }

  /** Owner F8: free until printing starts. A paid order is refunded in full to the wallet, to the buckets it came from. */
  async cancel(userId: string, id: string, reason?: string): Promise<SetPetRequestDto> {
    const current = await this.ownRequest(userId, id);
    if (!SET_PET_MEMBER_CANCELLABLE.includes(current.status)) throw new ApiException("SET_PET_NOT_CANCELLABLE", "Printing has started; contact support if there is a print defect.", HttpStatus.CONFLICT, { status: current.status });
    const note = cleanText(reason ?? "", 500, true) || null;
    const dispatch = await this.prisma.$transaction(async (tx) => {
      const moved = await tx.setPetRequest.updateMany({ where: { id, userId, status: current.status }, data: { status: SetPetRequestStatus.CANCELLED, cancelledAt: new Date(), cancelledBy: SetPetActor.MEMBER, cancelReason: note } });
      if (!moved.count) throw new ApiException("SET_PET_CHANGED", "This order changed meanwhile; reload it.", HttpStatus.CONFLICT);
      if (current.status === SetPetRequestStatus.PAID) await this.refundInTx(tx, id);
      await tx.setPetProof.updateMany({ where: { requestId: id, status: SetPetProofStatus.SENT }, data: { status: SetPetProofStatus.SUPERSEDED, decidedAt: new Date() } });
      await tx.setPetRequestEvent.create({ data: { requestId: id, fromStatus: current.status, toStatus: SetPetRequestStatus.CANCELLED, actor: SetPetActor.MEMBER, actorUserId: userId, note } });
      return this.events.stage("SetPetRequestCancelled", { requestId: id, userId, by: "MEMBER", fromStatus: current.status }, { tx, aggregateType: "SetPetRequest", aggregateId: id });
    });
    await dispatch();
    return this.get(userId, id);
  }

  /**
   * Refunds a paid order in full to the member's wallet, inside the caller's transaction (which already moved the
   * status with compare-and-set). Each bucket gets back what it paid; idempotent on the order (refundedAt).
   */
  async refundInTx(tx: Prisma.TransactionClient, id: string): Promise<number> {
    const row = await tx.setPetRequest.findUniqueOrThrow({ where: { id }, select: { userId: true, totalPaidIrr: true, paidWithdrawableIrr: true, paidPurchaseOnlyIrr: true, refundedAt: true } });
    if (row.refundedAt || !row.totalPaidIrr) return 0;
    const marked = await tx.setPetRequest.updateMany({ where: { id, refundedAt: null }, data: { refundedAt: new Date(), refundedIrr: row.totalPaidIrr } });
    if (!marked.count) return 0;
    const withdrawable = Math.min(row.paidWithdrawableIrr ?? 0, row.totalPaidIrr);
    const parts: Array<[WalletBalanceType, number]> = [
      [WalletBalanceType.WITHDRAWABLE, withdrawable],
      [WalletBalanceType.PURCHASE_ONLY, row.totalPaidIrr - withdrawable],
    ];
    for (const [balanceType, amount] of parts) {
      if (amount <= 0) continue;
      await this.wallet.credit({ userId: row.userId, balanceType, amount, source: WalletCreditSource.REFUND, referenceType: SET_PET_REFUND_REFERENCE, referenceId: id, debitAccount: LedgerAccountCode.PLATFORM_REVENUE }, tx);
    }
    return row.totalPaidIrr;
  }

  /**
   * Owner P40: one-click reorder. The old order's garments and prints (with the member's own checked designs) become
   * the builder draft; the member checks it and sends it as a new order — with a new proof, as always.
   */
  async reorder(userId: string, id: string): Promise<SetPetDraftDto> {
    const row = await this.prisma.setPetRequest.findFirst({ where: { id, userId }, include: REQUEST_INCLUDE });
    if (!row) throw new NotFoundApiException("Set Pet request");
    const dto = toSetPetRequestDto(row);
    return this.saveDraft(userId, {
      version: 2,
      reorderOfId: row.id,
      items: dto.items.map(({ garment, size, colour, petId, petName, petSpecies }) => ({ garment, size, colour, petId, petName, petSpecies })),
      placements: dto.placements,
      forPetId: dto.forPetId,
      notes: dto.notes ?? "",
      step: "review",
    });
  }

  // ------------------------------------------------------------------------------------------------ helpers

  private async ownAddress(userId: string, addressId: string): Promise<AddressSnapshotDto> {
    const address = await this.prisma.customerAddress.findFirst({ where: { id: addressId, archivedAt: null, household: { members: { some: { userId } } } } });
    if (!address) throw new NotFoundApiException("Address");
    return {
      recipient: address.recipient, phone: address.phone, addressLine: address.addressLine, city: address.city, region: address.region,
      countryCode: address.countryCode, instructions: address.instructions, area: address.area, postalCode: address.postalCode,
      latitude: address.latitude, longitude: address.longitude,
    };
  }

  private async ownFile(userId: string, fileId: string) {
    const file = await this.prisma.setPetDesignFile.findFirst({ where: { id: fileId, userId } });
    if (!file) throw new NotFoundApiException("Set Pet design");
    return file;
  }

  private async ownRequest(userId: string, id: string) {
    const row = await this.prisma.setPetRequest.findFirst({ where: { id, userId }, select: { id: true, status: true } });
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

  /** Unplaced uploads the member left behind for two weeks, and rejected ones: rows and objects go. */
  private async removeStaleLooseFiles(userId: string) {
    const stale = await this.prisma.setPetDesignFile.findMany({ where: { userId, placements: { none: {} }, OR: [{ status: SetPetDesignFileStatus.REJECTED }, { createdAt: { lt: new Date(Date.now() - LOOSE_FILE_TTL_MS) } }] }, select: { id: true, objectKey: true }, take: 50 });
    if (!stale.length) return;
    const removed = await this.prisma.setPetDesignFile.findMany({ where: { id: { in: stale.map((f) => f.id) }, placements: { none: {} } }, select: { id: true, objectKey: true } });
    await this.prisma.setPetDesignFile.deleteMany({ where: { id: { in: removed.map((f) => f.id) }, placements: { none: {} } } });
    // Only the objects whose rows really went: a file placed on an order meanwhile keeps its bytes.
    const kept = new Set((await this.prisma.setPetDesignFile.findMany({ where: { id: { in: removed.map((f) => f.id) } }, select: { id: true } })).map((f) => f.id));
    await Promise.all(removed.filter((f) => !kept.has(f.id)).map((f) => this.storage.deletePrivateObject(f.objectKey).catch(() => undefined)));
  }
}

class TooLargeError extends Error {}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/** Trims, collapses whitespace (keeping line breaks when allowed), drops control characters, caps the length. */
export function cleanText(value: string, max: number, multiline = false): string {
  const kept = [...value].filter((c) => {
    const code = c.charCodeAt(0);
    return (code >= 32 && code !== 127) || (multiline && c === "\n");
  }).join("");
  const collapsed = multiline ? kept.replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n") : kept.replace(/\s+/g, " ");
  return collapsed.trim().slice(0, max);
}
