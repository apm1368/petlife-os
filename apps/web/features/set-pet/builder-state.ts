import {
  SET_PET_COLOUR_KEYS,
  SET_PET_FONTS,
  SET_PET_GARMENTS,
  SET_PET_SIZES,
  SET_PET_ZONE_KEYS,
  setPetWearerOf,
  type SetPetColour,
  type SetPetFont,
  type SetPetGarment,
  type SetPetOrderInput,
  type SetPetRequestDto,
  type SetPetSize,
  type SetPetZone,
} from "@petlife/types";

/** One garment in the builder. Pet garments name the pet: from the profile (petId) or typed by hand. */
export type ItemState = {
  key: string;
  garment: SetPetGarment;
  size: SetPetSize;
  colour: SetPetColour;
  petId?: string | null;
  petName?: string;
  petSpecies?: "DOG" | "CAT" | null;
  /** Pet garments follow the first human garment's colour until changed (owner P13). */
  colourFollowsHuman?: boolean;
};

export type PrintState =
  | { kind: "image"; designId: string; scale: number; offsetX: number; offsetY: number }
  | { kind: "text"; text: string; font: SetPetFont; colour: SetPetColour };

export const BUILDER_STEPS = ["garments", "prints", "review"] as const;
export type BuilderStep = (typeof BUILDER_STEPS)[number];

/** Everything the builder needs to come back to where the member was (owner P5 drafts, P40 reorder, P39 edit). */
export type BuilderSnapshot = {
  version: 2;
  step: BuilderStep;
  items: ItemState[];
  prints: Partial<Record<SetPetZone, PrintState>>;
  forPetId: string | null;
  notes: string;
  reorderOfId?: string | null;
};

let seq = 0;
export const newKey = () => `i${Date.now().toString(36)}${(++seq).toString(36)}`;

export function emptySnapshot(): BuilderSnapshot {
  return {
    version: 2,
    step: "garments",
    items: [
      { key: newKey(), garment: "HUMAN_TEE", size: "M", colour: "white" },
      { key: newKey(), garment: "PET_TEE", size: "M", colour: "white", petId: null, petName: "", petSpecies: "DOG", colourFollowsHuman: true },
    ],
    prints: {},
    forPetId: null,
    notes: "",
  };
}

const oneOf = <T extends string>(list: readonly T[], value: unknown, fallback: T): T => (typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : fallback);
const num = (value: unknown, fallback: number, min: number, max: number) => (typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);

/**
 * Reads a saved draft (from the account, this device, or a reorder) defensively: anything unknown is dropped, so an
 * old or edited draft can never break the builder.
 */
export function readSnapshot(raw: unknown): BuilderSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const items = Array.isArray(r.items)
    ? r.items.slice(0, 17).flatMap((value): ItemState[] => {
        if (!value || typeof value !== "object") return [];
        const v = value as Record<string, unknown>;
        const garment = oneOf(SET_PET_GARMENTS, v.garment, "HUMAN_TEE");
        const item: ItemState = { key: newKey(), garment, size: oneOf(SET_PET_SIZES, v.size, "M"), colour: oneOf(SET_PET_COLOUR_KEYS, v.colour, "white") };
        if (setPetWearerOf(garment) === "PET") {
          item.petId = typeof v.petId === "string" ? v.petId : null;
          item.petName = typeof v.petName === "string" ? v.petName.slice(0, 40) : "";
          item.petSpecies = v.petSpecies === "CAT" ? "CAT" : "DOG";
          item.colourFollowsHuman = v.colourFollowsHuman === true;
        }
        return [item];
      })
    : [];
  if (!items.length) return null;
  const prints: BuilderSnapshot["prints"] = {};
  const rawPrints = (r.prints ?? {}) as Record<string, unknown>;
  // A reorder sends the order's placements; a draft sends prints.
  const placements = Array.isArray(r.placements) ? (r.placements as Array<Record<string, unknown>>) : null;
  const entries: Array<[string, Record<string, unknown>]> = placements
    ? placements.map((p) => [String(p.zone), p.designFileId ? { kind: "image", designId: p.designFileId, scale: p.scale, offsetX: p.offsetX, offsetY: p.offsetY } : { kind: "text", text: p.text, font: p.font, colour: p.textColour }])
    : Object.entries(rawPrints).map(([zone, p]) => [zone, (p ?? {}) as Record<string, unknown>]);
  for (const [zone, p] of entries) {
    if (!(SET_PET_ZONE_KEYS as string[]).includes(zone)) continue;
    if (p.kind === "image" && typeof p.designId === "string") {
      prints[zone as SetPetZone] = { kind: "image", designId: p.designId, scale: num(p.scale, 1, 1, 4), offsetX: num(p.offsetX, 0, -1, 1), offsetY: num(p.offsetY, 0, -1, 1) };
    } else if (p.kind === "text" && typeof p.text === "string" && p.text.trim()) {
      prints[zone as SetPetZone] = { kind: "text", text: p.text.slice(0, 40), font: oneOf(SET_PET_FONTS, p.font, "VAZIRMATN"), colour: oneOf(SET_PET_COLOUR_KEYS, p.colour, "black") };
    }
  }
  return {
    version: 2,
    step: oneOf(["garments", "prints", "review"] as const, r.step, "garments"),
    items,
    prints,
    forPetId: typeof r.forPetId === "string" ? r.forPetId : null,
    notes: typeof r.notes === "string" ? r.notes.slice(0, 1000) : "",
    reorderOfId: typeof r.reorderOfId === "string" ? r.reorderOfId : null,
  };
}

export function snapshotFromOrder(order: SetPetRequestDto): BuilderSnapshot {
  return readSnapshot({ ...order, step: "review", prints: undefined, placements: order.placements, reorderOfId: null }) ?? emptySnapshot();
}

/** The order the API receives. `ids` maps designs picked before sign-in (local ids) to their uploaded ids. */
export function toOrderInput(s: BuilderSnapshot, ids: ReadonlyMap<string, string> = new Map()): SetPetOrderInput {
  const hasPet = s.items.some((i) => setPetWearerOf(i.garment) === "PET");
  return {
    items: s.items.map((i) =>
      setPetWearerOf(i.garment) === "PET"
        ? { garment: i.garment, size: i.size, colour: i.colour, ...(i.petId ? { petId: i.petId } : { petName: (i.petName ?? "").trim(), petSpecies: i.petSpecies ?? "DOG" }) }
        : { garment: i.garment, size: i.size, colour: i.colour },
    ),
    placements: SET_PET_ZONE_KEYS.flatMap((zone) => {
      const p = s.prints[zone];
      if (!p) return [];
      if (zone === "PET_BACK" && !hasPet) return [];
      return p.kind === "image"
        ? [{ zone, designFileId: ids.get(p.designId) ?? p.designId, scale: p.scale, offsetX: p.offsetX, offsetY: p.offsetY }]
        : [{ zone, text: p.text.trim(), font: p.font, textColour: p.colour }];
    }),
    forPetId: hasPet ? null : s.forPetId,
    notes: s.notes.trim() || null,
  };
}
