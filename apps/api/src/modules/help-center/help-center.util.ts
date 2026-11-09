/**
 * Pure helpers for the Help Center, legal documents and status page — kept free of Prisma so the rules
 * that matter (what a reader may see, how a search is scored, what a rollback copies) are unit-testable.
 */

/** The fields of a HelpArticle that a version snapshot freezes. Counters and publish pointers are not content. */
export interface HelpArticleContent {
  categoryId: string;
  slug: string;
  title: string;
  summary: string | null;
  body: string;
  contextKeys: string[];
  isFaq: boolean;
  sortOrder: number;
}

/** Everything a version snapshot stores, as a plain JSON object. */
export function toSnapshot(article: HelpArticleContent): HelpArticleContent {
  return {
    categoryId: article.categoryId,
    slug: article.slug,
    title: article.title,
    summary: article.summary,
    body: article.body,
    contextKeys: [...article.contextKeys],
    isFaq: article.isFaq,
    sortOrder: article.sortOrder,
  };
}

/** Narrows an unknown JSON value read back from a version row; a malformed snapshot is rejected, never guessed at. */
export function fromSnapshot(value: unknown): HelpArticleContent | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.categoryId !== "string" || typeof v.slug !== "string" || typeof v.title !== "string" || typeof v.body !== "string") return null;
  if (v.summary !== null && v.summary !== undefined && typeof v.summary !== "string") return null;
  if (!Array.isArray(v.contextKeys) || !v.contextKeys.every((k) => typeof k === "string")) return null;
  return {
    categoryId: v.categoryId,
    slug: v.slug,
    title: v.title,
    summary: (v.summary as string | null | undefined) ?? null,
    body: v.body,
    contextKeys: v.contextKeys as string[],
    isFaq: v.isFaq === true,
    sortOrder: typeof v.sortOrder === "number" ? v.sortOrder : 0,
  };
}

// Marks that carry no meaning for matching. \p{Mn} covers every nonspacing mark (Arabic harakat U+064B-U+065F and
// dagger alif U+0670 among them) without listing a combining-character range, which both says what is meant and
// keeps the pattern out of no-misleading-character-class. Tatweel (U+0640) is a letter-modifier, not a mark, so it
// is named on its own. NFKC runs first, so a letter written with a separate combining mark is already composed.
const IGNORABLE_MARKS = /[\p{Mn}\u0640]/gu;

/**
 * Lowercases and strips Arabic/Persian presentation variants so "كتاب" and "کتاب", or a Persian and an
 * Arabic-Indic digit, match each other. Persian users type both forms interchangeably; a search that
 * treats them as different would silently miss articles that are plainly there.
 */
export function normalizeSearchText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/\u064A|\u0649/g, "\u06CC") // Arabic yeh / alef maksura -> Persian yeh
    .replace(/\u0643/g, "\u06A9") // Arabic kaf -> Persian keheh
    .replace(IGNORABLE_MARKS, "")
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0)) // Persian digits -> latin
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)) // Arabic-Indic digits -> latin
    .toLowerCase()
    .trim();
}

/** Splits a query into its normalized terms; empty/whitespace-only input yields no terms (so no search runs). */
export function searchTerms(query: string): string[] {
  return normalizeSearchText(query)
    .split(/[\s‌]+/u) // whitespace and ZWNJ
    .filter((term) => term.length > 0)
    .slice(0, 8);
}

/**
 * Relevance of one article for a set of terms. A title hit outweighs a summary hit, which outweighs a body
 * hit; an article must match EVERY term somewhere to count at all, so a two-word query narrows results
 * rather than widening them. Returns 0 for "does not match".
 */
export function scoreArticle(article: { title: string; summary: string | null; body: string }, terms: string[]): number {
  if (terms.length === 0) return 0;
  const title = normalizeSearchText(article.title);
  const summary = normalizeSearchText(article.summary ?? "");
  const body = normalizeSearchText(article.body);
  let score = 0;
  for (const term of terms) {
    const inTitle = title.includes(term);
    const inSummary = summary.includes(term);
    const inBody = body.includes(term);
    if (!inTitle && !inSummary && !inBody) return 0;
    score += (inTitle ? 10 : 0) + (inSummary ? 4 : 0) + (inBody ? 1 : 0);
  }
  return score;
}

/** A URL slug: lowercase latin, digits and hyphens only, no leading/trailing hyphen. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Cap on how much of an article body the list/search endpoints return, so a result list stays small. */
export const EXCERPT_LENGTH = 200;

export function excerpt(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length <= EXCERPT_LENGTH ? flat : `${flat.slice(0, EXCERPT_LENGTH).trimEnd()}…`;
}
