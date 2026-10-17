import type { PetPolicyStatus } from "@prisma/client";

export interface PetPolicyFields {
  dogsAllowed?: boolean | null;
  catsAllowed?: boolean | null;
  otherPetsAllowed?: boolean | null;
  maxPets?: number | null;
  maxWeightKg?: number | null;
  petFeeIrr?: number | null;
  depositIrr?: number | null;
  restrictions?: string | null;
  allowedAreas?: string | null;
  notes?: string | null;
}

export interface PetPolicyObservation extends PetPolicyFields {
  status: PetPolicyStatus;
  /** Where the claim came from: SOURCE_AMENITY, SOURCE_POLICY_TEXT, SOURCE_FILTER, AUTHORIZED_FEED. Null when UNKNOWN. */
  evidenceSource: string | null;
  evidenceText: string | null;
  evidencePath: string | null;
}

/** Text the adapter found in *policy-like* places (house rules, amenities, structured policy fields) — never reviews. */
export interface PetTextCandidate {
  text: string;
  path: string;
  kind: "AMENITY" | "POLICY" | "RULES" | "DESCRIPTION";
}

export const UNKNOWN_PET_POLICY: PetPolicyObservation = { status: "UNKNOWN", evidenceSource: null, evidenceText: null, evidencePath: null };

const fa = (s: string) => s.replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/‌/g, " ").replace(/\s+/g, " ").trim();
// Subject: the concept of a pet. "پت" only as a whole word (not inside پتو "blanket").
const SUBJECT = /(حیوان(?:ات)?\s*خانگی|حیوان|(?<![\p{L}])پت(?![\p{L}])|سگ|گربه|\bpets?\b|\bdogs?\b|\bcats?\b)/iu;
const NEGATIVE = [
  /(ورود|پذیرش|همراه\s*داشتن|آوردن)\s*(?:\S+\s*){0,3}(حیوان|پت|سگ|گربه)[^.،؛\n]{0,25}(ممنوع|مجاز\s*نیست|امکان\s*پذیر\s*نیست|امکان‌پذیر\s*نیست|نمی\s*باشد|نمی‌باشد|ندارد)/u,
  /(حیوان(?:ات)?\s*خانگی|پت|سگ|گربه)[^.،؛\n]{0,25}(ممنوع|مجاز\s*نیست|پذیرفته\s*نمی|قبول\s*نمی|امکان\s*پذیر\s*نیست|ندارد|نمی\s*پذیر)/u,
  /(پذیرش|ورود)\s*(حیوان(?:ات)?\s*خانگی|پت)\s*(ندارد|نداریم)/u,
  /\bno\s+pets?\b|\bpets?\s+(are\s+)?not\s+allowed\b/i,
];
const POSITIVE = [
  /(ورود|پذیرش|همراه\s*داشتن|آوردن)\s*(?:\S+\s*){0,3}(حیوان|پت|سگ|گربه)[^.،؛\n]{0,25}(مجاز(?!\s*نیست)|آزاد|امکان\s*پذیر(?!\s*نیست)|امکان‌پذیر(?!\s*نیست)|بلامانع|می\s*باشد|است)/u,
  /(حیوان(?:ات)?\s*خانگی|پت|سگ|گربه)[^.،؛\n]{0,20}(مجاز(?!\s*نیست)|پذیرفته\s*می|بلامانع|آزاد\s*است)/u,
  /(پذیرش|امکان\s*ورود)\s*(حیوان(?:ات)?\s*خانگی|پت)(?!\s*(ندارد|نداریم|ممنوع))/u,
  /(پت\s*فرندلی|pet[-\s]?friendly|pets?\s+allowed)/iu,
];
const EXPLICIT_AMENITY_POSITIVE = /^(پذیرش\s*حیوان(?:ات)?\s*خانگی|امکان\s*ورود\s*حیوان\s*خانگی|ورود\s*حیوان\s*خانگی\s*مجاز|حیوان\s*خانگی\s*مجاز|پت\s*فرندلی|pet[-\s]?friendly|pets?\s+allowed)$/iu;

/** The sentence around a match, short (evidence is an excerpt, not a copy of the page). */
function excerpt(text: string, idx: number, max = 200): string {
  const start = Math.max(0, text.lastIndexOf(".", idx) + 1, text.lastIndexOf("\n", idx) + 1);
  const ends = [".", "\n", "؛"].map((c) => text.indexOf(c, idx)).filter((i) => i >= 0);
  const end = ends.length ? Math.min(...ends) + 1 : text.length;
  return text.slice(start, end).trim().slice(0, max);
}

/**
 * Deterministic pet-policy classification from policy-like text. Rules:
 * - only explicit statements count; a villa, a garden or a dog in a review is never evidence (reviews are not passed in);
 * - negation in the same clause wins over the keyword (ورود حیوان ممنوع ≠ allowed);
 * - both an explicit yes and an explicit no → AMBIGUOUS; a pet word with no verdict → AMBIGUOUS only in POLICY/RULES text;
 * - nothing found → UNKNOWN (never "not allowed").
 */
export function extractPetPolicyFromText(candidates: PetTextCandidate[]): PetPolicyObservation {
  let pos: { text: string; path: string; kind: PetTextCandidate["kind"] } | null = null;
  let neg: { text: string; path: string; kind: PetTextCandidate["kind"] } | null = null;
  let mention: { text: string; path: string } | null = null;
  const fields: PetPolicyFields = {};
  for (const c of candidates) {
    const t = fa(c.text ?? "");
    if (!t) continue;
    if (c.kind === "AMENITY" && EXPLICIT_AMENITY_POSITIVE.test(t)) { pos ??= { text: t.slice(0, 200), path: c.path, kind: c.kind }; continue; }
    const n = NEGATIVE.map((r) => r.exec(t)).find(Boolean);
    if (n) { neg ??= { text: excerpt(t, n.index), path: c.path, kind: c.kind }; markSpecies(t.slice(n.index, n.index + n[0].length), fields, false); continue; }
    const p = POSITIVE.map((r) => r.exec(t)).find(Boolean);
    if (p) { pos ??= { text: excerpt(t, p.index), path: c.path, kind: c.kind }; markSpecies(t.slice(Math.max(0, p.index - 40), p.index + p[0].length + 40), fields, true); extractNumbers(t, fields); continue; }
    const m = SUBJECT.exec(t);
    if (m && (c.kind === "POLICY" || c.kind === "RULES")) mention ??= { text: excerpt(t, m.index), path: c.path };
  }
  const src = (k: PetTextCandidate["kind"]) => (k === "AMENITY" ? "SOURCE_AMENITY" : "SOURCE_POLICY_TEXT");
  if (pos && neg) return { status: "AMBIGUOUS", evidenceSource: src(pos.kind), evidenceText: `${pos.text} | ${neg.text}`.slice(0, 300), evidencePath: `${pos.path} | ${neg.path}` };
  if (pos) return { ...fields, status: "CONFIRMED_ALLOWED", evidenceSource: src(pos.kind), evidenceText: pos.text, evidencePath: pos.path };
  if (neg) return { dogsAllowed: fields.dogsAllowed, catsAllowed: fields.catsAllowed, status: "CONFIRMED_NOT_ALLOWED", evidenceSource: src(neg.kind), evidenceText: neg.text, evidencePath: neg.path };
  if (mention) return { status: "AMBIGUOUS", evidenceSource: "SOURCE_POLICY_TEXT", evidenceText: mention.text, evidencePath: mention.path };
  return UNKNOWN_PET_POLICY;
}

function markSpecies(clause: string, f: PetPolicyFields, allowed: boolean) {
  const dog = /سگ|\bdogs?\b/i.test(clause);
  const cat = /گربه|\bcats?\b/i.test(clause);
  if (dog) f.dogsAllowed = allowed;
  if (cat) f.catsAllowed = allowed;
  if (!allowed && !dog && !cat) { /* a generic "no pets" says nothing per-species we can store safely beyond the status */ }
}

const DIGITS: Record<string, string> = { "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9" };
const latin = (s: string) => s.replace(/[۰-۹]/g, (d) => DIGITS[d]!).replace(/[٬,]/g, "");

function extractNumbers(t: string, f: PetPolicyFields) {
  const s = latin(t);
  const kg = /(?:حداکثر|تا)\s*(\d{1,3})\s*(?:کیلو|kg)/i.exec(s);
  if (kg) f.maxWeightKg = Number(kg[1]);
  const n = /(?:حداکثر|تا)\s*(\d{1,2})\s*(?:عدد|قلاده|حیوان)/.exec(s);
  if (n) f.maxPets = Number(n[1]);
  const fee = /(?:هزینه|مبلغ)[^.\d]{0,30}(\d{4,10})\s*(ریال|تومان)/.exec(s);
  if (fee) f.petFeeIrr = Number(fee[1]) * (fee[2] === "تومان" ? 10 : 1);
}
