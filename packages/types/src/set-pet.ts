/**
 * «ست پت» — Set Pet (owner, 2026-11-13): matching custom-printed outfits for a member and their pet. An order request,
 * not a shop product: staff quote it, the member accepts, then production and shipping. Payment comes later.
 */
export const SET_PET_STATUSES = ["SUBMITTED", "QUOTED", "CONFIRMED", "IN_PRODUCTION", "SHIPPED", "CANCELLED"] as const;
export type SetPetRequestStatus = (typeof SET_PET_STATUSES)[number];

/** One size scale for the human and the pet garment; XXL and XXXL are shown as 2XL and 3XL. */
export const SET_PET_SIZES = ["S", "M", "L", "XL", "XXL", "XXXL"] as const;
export type SetPetSize = (typeof SET_PET_SIZES)[number];

/** Fixed print zones (owner): two 10×10 cm sleeve zones, two 20×20 cm body zones, and the pet garment's back. */
export const SET_PET_ZONES = {
  RIGHT_UPPER_ARM: { garment: "HUMAN", widthCm: 10, heightCm: 10 },
  LEFT_UPPER_ARM: { garment: "HUMAN", widthCm: 10, heightCm: 10 },
  FRONT_CENTER: { garment: "HUMAN", widthCm: 20, heightCm: 20 },
  BACK: { garment: "HUMAN", widthCm: 20, heightCm: 20 },
  PET_BACK: { garment: "PET", widthCm: null, heightCm: null },
} as const;
export type SetPetZone = keyof typeof SET_PET_ZONES;

/** Plausible pet measurements; anything outside is refused as a typo. */
export const SET_PET_MEASUREMENT_RANGES = {
  neckCm: { min: 10, max: 80 },
  chestCm: { min: 15, max: 150 },
  backLengthCm: { min: 10, max: 110 },
  weightKg: { min: 0.3, max: 100 },
} as const;

export interface SetPetMeasurements {
  neckCm: number;
  chestCm: number;
  backLengthCm: number;
  weightKg: number;
}

export type SetPetDesignFileStatus = "PENDING_UPLOAD" | "READY" | "REJECTED";

export interface SetPetDesignFileDto {
  id: string;
  status: SetPetDesignFileStatus;
  mimeType: string;
  fileSizeBytes: number;
  originalFilename: string | null;
  /** JPEG/PNG/WebP only: ask for a short-lived preview URL. Print files (SVG/PDF/AI/PSD) and HEIC are never shown inline. */
  previewable: boolean;
  /** Set once placed on a request. */
  requestId: string | null;
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

export interface SetPetPlacementDto {
  zone: SetPetZone;
  designFileId: string;
}

export interface SetPetTimelineEntryDto {
  fromStatus: SetPetRequestStatus | null;
  toStatus: SetPetRequestStatus;
  actor: "MEMBER" | "STAFF";
  note: string | null;
  at: string;
}

export interface SetPetRequestDto {
  id: string;
  number: number;
  /** "SP-000123". */
  reference: string;
  status: SetPetRequestStatus;
  petId: string | null;
  humanColour: string;
  humanSizes: SetPetSize[];
  petSize: SetPetSize;
  petColour: string;
  petMeasurements: SetPetMeasurements;
  notes: string | null;
  placements: SetPetPlacementDto[];
  designs: SetPetDesignFileDto[];
  quote: { amountIrr: number; note: string | null; estimatedReadyAt: string | null; quotedAt: string } | null;
  confirmedAt: string | null;
  productionStartedAt: string | null;
  shippedAt: string | null;
  shippingNote: string | null;
  cancelledAt: string | null;
  cancelledBy: "MEMBER" | "STAFF" | null;
  cancelReason: string | null;
  timeline: SetPetTimelineEntryDto[];
  createdAt: string;
  updatedAt: string;
}

export interface SetPetCreateRequestInput {
  petId?: string;
  humanColour: string;
  humanSizes: SetPetSize[];
  petSize: SetPetSize;
  petColour: string;
  petMeasurements: SetPetMeasurements;
  placements: SetPetPlacementDto[];
  notes?: string;
}

/** What the request form needs: sizes, zones with their print areas, accepted files and limits. */
export interface SetPetOptionsDto {
  sizes: readonly SetPetSize[];
  zones: Array<{ zone: SetPetZone; garment: "HUMAN" | "PET"; widthCm: number | null; heightCm: number | null }>;
  measurementRanges: typeof SET_PET_MEASUREMENT_RANGES;
  acceptedExtensions: string[];
  maxFileBytes: number;
  maxDesigns: number;
  maxHumanGarments: number;
}
