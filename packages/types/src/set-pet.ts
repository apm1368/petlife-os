/**
 * «ست پت» — Set Pet (owner, 2026-11-13; answers in issue #368): matching custom-printed outfits for a member and their
 * pets, printed in-house by opetlife. Fixed price table (garment + print zone, set discount %), a print proof ALWAYS
 * before payment, edits allowed until the proof is approved, full payment from the wallet, ~5 working days, shipping
 * by the shop's methods.
 */
export const SET_PET_STATUSES = [
  "SUBMITTED",
  "NEEDS_NEW_DESIGN",
  "PROOF_SENT",
  "AWAITING_PAYMENT",
  "PAID",
  "IN_PRODUCTION",
  "SHIPPED",
  "CANCELLED",
] as const;
export type SetPetRequestStatus = (typeof SET_PET_STATUSES)[number];

/** The member may change the order (items, prints, notes) until they approve the proof (owner P39). */
export const SET_PET_EDITABLE_STATUSES: readonly SetPetRequestStatus[] = ["SUBMITTED", "NEEDS_NEW_DESIGN", "PROOF_SENT"];
/** Cancellation is free until printing starts (owner F8); a paid order is refunded to the wallet. */
export const SET_PET_MEMBER_CANCELLABLE: readonly SetPetRequestStatus[] = ["SUBMITTED", "NEEDS_NEW_DESIGN", "PROOF_SENT", "AWAITING_PAYMENT", "PAID"];

/** One size scale for people and pets; XXL and XXXL are shown as 2XL and 3XL. */
export const SET_PET_SIZES = ["S", "M", "L", "XL", "XXL", "XXXL"] as const;
export type SetPetSize = (typeof SET_PET_SIZES)[number];

export const SET_PET_HUMAN_GARMENTS = ["HUMAN_TEE", "HUMAN_HOODIE", "HUMAN_SWEATSHIRT"] as const;
export const SET_PET_PET_GARMENTS = ["PET_TEE", "PET_HOODIE", "PET_BANDANA"] as const;
export const SET_PET_GARMENTS = [...SET_PET_HUMAN_GARMENTS, ...SET_PET_PET_GARMENTS] as const;
export type SetPetGarment = (typeof SET_PET_GARMENTS)[number];
export type SetPetWearer = "HUMAN" | "PET";
export const setPetWearerOf = (garment: SetPetGarment): SetPetWearer => (garment.startsWith("PET_") ? "PET" : "HUMAN");

/** Fixed print zones (owner): two 10×10 cm sleeve zones and two 20×20 cm body zones on every human garment; the pet's back. */
export const SET_PET_ZONES = {
  RIGHT_UPPER_ARM: { wearer: "HUMAN", widthCm: 10, heightCm: 10 },
  LEFT_UPPER_ARM: { wearer: "HUMAN", widthCm: 10, heightCm: 10 },
  FRONT_CENTER: { wearer: "HUMAN", widthCm: 20, heightCm: 20 },
  BACK: { wearer: "HUMAN", widthCm: 20, heightCm: 20 },
  PET_BACK: { wearer: "PET", widthCm: null, heightCm: null },
} as const;
export type SetPetZone = keyof typeof SET_PET_ZONES;
export const SET_PET_ZONE_KEYS = Object.keys(SET_PET_ZONES) as SetPetZone[];

/** Text prints (owner P23): three fonts. */
export const SET_PET_FONTS = ["VAZIRMATN", "LALEZAR", "AMIRI"] as const;
export type SetPetFont = (typeof SET_PET_FONTS)[number];

/** The six base colours (owner P12): key → swatch. The pet colour defaults to the human one (P13). */
export const SET_PET_COLOURS = {
  white: "#FFFFFF",
  black: "#1E1F1D",
  "heather-grey": "#B9BDBA",
  navy: "#22304A",
  cream: "#F3E9D2",
  sage: "#A9B9A0",
} as const;
export type SetPetColour = keyof typeof SET_PET_COLOURS;
export const SET_PET_COLOUR_KEYS = Object.keys(SET_PET_COLOURS) as SetPetColour[];

/** Technical caps (owner: "unlimited" pets and designs). */
export const SET_PET_LIMITS = {
  maxHumanGarments: 5,
  maxPetGarments: 12,
  maxDesignsPerOrder: 20,
  maxTextLength: 40,
  maxNotesLength: 1000,
  maxFileBytes: 50 * 1024 * 1024,
  minScale: 1,
  maxScale: 4,
  /** Below this effective resolution at print size the member is warned (owner P26); never blocked. */
  warnDpi: 150,
} as const;

export const SET_PET_ACCEPTED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "heic", "heif", "pdf", "svg", "ai", "psd"] as const;

// ------------------------------------------------------------------------------------------------ pricing

/** The fixed price table (IRR). A garment or zone priced 0 is not on sale yet. */
export interface SetPetPriceTable {
  garmentPricesIrr: Partial<Record<SetPetGarment, number>>;
  zonePricesIrr: Partial<Record<SetPetZone, number>>;
  /** Percent off the whole set when it has both a human and a pet garment (owner P37). */
  setDiscountPercent: number;
}

export interface SetPetPriceLine {
  position: number;
  garment: SetPetGarment;
  garmentIrr: number;
  zones: Array<{ zone: SetPetZone; irr: number }>;
  lineIrr: number;
}

export interface SetPetPrice {
  lines: SetPetPriceLine[];
  subtotalIrr: number;
  discountPercent: number;
  discountIrr: number;
  totalIrr: number;
  /** Garments or zones the table has no price for: the order cannot be sent until staff price them. */
  unpriced: Array<SetPetGarment | SetPetZone>;
}

/**
 * Owner P36: each garment's price plus each zone printed on it (human zones on every human garment, the pet zone on
 * every pet garment), then the set discount when both kinds are present. Shared by the API (authoritative) and the
 * builder (live price), so both always agree.
 */
export function priceSetPet(table: SetPetPriceTable, items: ReadonlyArray<{ garment: SetPetGarment }>, zones: readonly SetPetZone[]): SetPetPrice {
  const unpriced = new Set<SetPetGarment | SetPetZone>();
  const lines = items.map((item, position) => {
    const garmentIrr = table.garmentPricesIrr[item.garment] ?? 0;
    if (garmentIrr <= 0) unpriced.add(item.garment);
    const wearer = setPetWearerOf(item.garment);
    const printed = zones
      .filter((zone) => SET_PET_ZONES[zone].wearer === wearer)
      .map((zone) => {
        const irr = table.zonePricesIrr[zone] ?? 0;
        if (irr <= 0) unpriced.add(zone);
        return { zone, irr };
      });
    return { position, garment: item.garment, garmentIrr, zones: printed, lineIrr: garmentIrr + printed.reduce((sum, z) => sum + z.irr, 0) };
  });
  const subtotalIrr = lines.reduce((sum, l) => sum + l.lineIrr, 0);
  const isSet = items.some((i) => setPetWearerOf(i.garment) === "HUMAN") && items.some((i) => setPetWearerOf(i.garment) === "PET");
  const discountPercent = isSet ? Math.min(Math.max(Math.trunc(table.setDiscountPercent || 0), 0), 90) : 0;
  // Round the discount down to whole toman so the member never pays a fraction of one.
  const discountIrr = Math.floor((subtotalIrr * discountPercent) / 100 / 10) * 10;
  return { lines, subtotalIrr, discountPercent, discountIrr, totalIrr: subtotalIrr - discountIrr, unpriced: [...unpriced] };
}

/**
 * Owner P35: while building, a range — from the zones already chosen (at least the cheapest one for each wearer) up to
 * every zone printed. The exact price is shown at review.
 */
export function priceRangeSetPet(table: SetPetPriceTable, items: ReadonlyArray<{ garment: SetPetGarment }>, chosenZones: readonly SetPetZone[]): { minIrr: number; maxIrr: number } {
  const zonePrice = (z: SetPetZone) => table.zonePricesIrr[z] ?? 0;
  const minZones = [...chosenZones];
  for (const wearer of ["HUMAN", "PET"] as const) {
    if (minZones.some((z) => SET_PET_ZONES[z].wearer === wearer)) continue;
    const cheapest = SET_PET_ZONE_KEYS.filter((z) => SET_PET_ZONES[z].wearer === wearer).sort((a, b) => zonePrice(a) - zonePrice(b))[0];
    if (cheapest) minZones.push(cheapest);
  }
  return { minIrr: priceSetPet(table, items, minZones).totalIrr, maxIrr: priceSetPet(table, items, SET_PET_ZONE_KEYS).totalIrr };
}

// ------------------------------------------------------------------------------------------------ files

export type SetPetDesignFileStatus = "PENDING_UPLOAD" | "READY" | "REJECTED";

export interface SetPetDesignFileDto {
  id: string;
  status: SetPetDesignFileStatus;
  mimeType: string;
  fileSizeBytes: number;
  originalFilename: string | null;
  /** JPEG/PNG/WebP only: ask for a short-lived preview URL. Print files (SVG/PDF/AI/PSD) and HEIC are never shown inline. */
  previewable: boolean;
  widthPx: number | null;
  heightPx: number | null;
  rejectReason: string | null;
  createdAt: string;
}

export interface SetPetUploadTargetDto {
  file: SetPetDesignFileDto;
  uploadUrl: string;
  method: "PUT";
  headers?: Record<string, string>;
  expiresInSeconds: number;
}

// ------------------------------------------------------------------------------------------------ orders

export interface SetPetItemInput {
  garment: SetPetGarment;
  size: SetPetSize;
  colour: SetPetColour;
  /** Pet garments: a pet from the member's profile (dog or cat), or a name and species entered by hand. */
  petId?: string | null;
  petName?: string | null;
  petSpecies?: "DOG" | "CAT" | null;
}

export interface SetPetPlacementInput {
  zone: SetPetZone;
  /** An uploaded design, or a line of text — one of the two. */
  designFileId?: string | null;
  text?: string | null;
  font?: SetPetFont | null;
  textColour?: SetPetColour | null;
  /** Simple crop and zoom (owner P27): zoom 1–4, centre offset −1…1. */
  scale?: number;
  offsetX?: number;
  offsetY?: number;
}

export interface SetPetOrderInput {
  items: SetPetItemInput[];
  placements: SetPetPlacementInput[];
  /** Owner P8: required for a human-only set — the member's pet that is lost or has died. */
  forPetId?: string | null;
  notes?: string | null;
}

export interface SetPetItemDto {
  position: number;
  garment: SetPetGarment;
  size: SetPetSize;
  colour: string;
  petId: string | null;
  petName: string | null;
  petSpecies: "DOG" | "CAT" | null;
}

export interface SetPetPlacementDto {
  zone: SetPetZone;
  designFileId: string | null;
  text: string | null;
  font: SetPetFont | null;
  textColour: string | null;
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface SetPetTimelineEntryDto {
  fromStatus: SetPetRequestStatus | null;
  toStatus: SetPetRequestStatus;
  actor: "MEMBER" | "STAFF";
  note: string | null;
  at: string;
}

export interface SetPetProofDto {
  id: string;
  status: "SENT" | "APPROVED" | "SUPERSEDED";
  note: string | null;
  petPrintWidthCm: number | null;
  petPrintHeightCm: number | null;
  sentAt: string | null;
}

export interface SetPetRequestDto {
  id: string;
  number: number;
  /** "SP-000123". */
  reference: string;
  status: SetPetRequestStatus;
  items: SetPetItemDto[];
  placements: SetPetPlacementDto[];
  designs: SetPetDesignFileDto[];
  forPetId: string | null;
  notes: string | null;
  price: { lines: SetPetPriceLine[]; subtotalIrr: number; discountPercent: number; discountIrr: number; totalIrr: number };
  /** The proof waiting for an answer (PROOF_SENT), or the approved one. */
  proof: SetPetProofDto | null;
  designRejectReason: string | null;
  payment: { shippingProvider: string | null; shippingIrr: number | null; totalPaidIrr: number | null; paidAt: string | null } | null;
  estimatedReadyAt: string | null;
  productionStartedAt: string | null;
  shippedAt: string | null;
  shippingNote: string | null;
  cancelledAt: string | null;
  cancelledBy: "MEMBER" | "STAFF" | null;
  cancelReason: string | null;
  refundedIrr: number | null;
  canEdit: boolean;
  canCancel: boolean;
  timeline: SetPetTimelineEntryDto[];
  createdAt: string;
  updatedAt: string;
}

/** One way to deliver a paid order: the shop's own shipping methods (owner F7). */
export interface SetPetShippingOptionDto {
  provider: string;
  priceIrr: number;
  etaDays: number | null;
}

export interface SetPetPayInput {
  addressId: string;
  shippingProvider: string;
  /** The total the member saw; if anything changed, paying fails instead of charging a different amount. */
  expectedTotalIrr: number;
  idempotencyKey: string;
}

/** What the builder needs: catalogue, limits and the live price table. */
export interface SetPetOptionsDto {
  sizes: readonly SetPetSize[];
  garments: readonly SetPetGarment[];
  colours: Record<string, string>;
  fonts: readonly SetPetFont[];
  zones: Array<{ zone: SetPetZone; wearer: SetPetWearer; widthCm: number | null; heightCm: number | null }>;
  acceptedExtensions: readonly string[];
  limits: typeof SET_PET_LIMITS;
  prices: SetPetPriceTable;
  /** False until staff have priced every garment and zone: the builder works, sending waits. */
  pricesReady: boolean;
  productionWorkingDays: number;
}

/** The member's auto-saved builder state (owner P5): the builder owns its shape, the API only stores it. */
export interface SetPetDraftDto {
  data: Record<string, unknown>;
  updatedAt: string;
}
