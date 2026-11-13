/** Article addresses: lowercase ASCII letters/digits joined by single hyphens (the API enforces the same rule). */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUG_MAX_LENGTH = 80;

const PERSIAN_DIGITS: Record<string, string> = { "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9", "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" };

const PERSIAN_LETTERS: Record<string, string> = {
  "آ": "a", "ا": "a", "أ": "a", "إ": "e", "ب": "b", "پ": "p", "ت": "t", "ث": "s", "ج": "j", "چ": "ch", "ح": "h", "خ": "kh",
  "د": "d", "ذ": "z", "ر": "r", "ز": "z", "ژ": "zh", "س": "s", "ش": "sh", "ص": "s", "ض": "z", "ط": "t", "ظ": "z", "ع": "", "غ": "gh",
  "ف": "f", "ق": "gh", "ک": "k", "ك": "k", "گ": "g", "ل": "l", "م": "m", "ن": "n", "ء": "", "ئ": "y", "ؤ": "o", "ة": "e", "ۀ": "e",
};

/** A readable Latin rendering of Persian text (no short vowels are written in Persian, so this is a suggestion to edit, not a dictionary). */
function transliterateWord(word: string): string {
  let out = "";
  const chars = [...word];
  chars.forEach((ch, i) => {
    const first = i === 0;
    const last = i === chars.length - 1;
    if (ch === "و") out += first ? "v" : "o";
    else if (ch === "ی" || ch === "ي") out += first ? "y" : "i";
    else if (ch === "ه") out += last && !first ? "e" : "h";
    else out += PERSIAN_LETTERS[ch] ?? ch;
  });
  return out;
}

/**
 * Builds a URL slug from a title in any of the site's languages: Persian is transliterated, Latin accents
 * are folded (ü → ue for German, ñ → n), everything else becomes single hyphens.
 */
export function slugify(input: string): string {
  const folded = input
    .replace(/[۰-۹٠-٩]/g, (d) => PERSIAN_DIGITS[d] ?? d)
    .replace(/‌/g, "")
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/[آ-یء-ي]+/g, (word) => ` ${transliterateWord(word)} `)
    .replace(/ä/gi, "ae").replace(/ö/gi, "oe").replace(/ü/gi, "ue").replace(/ß/g, "ss")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  const slug = folded.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
  if (slug.length <= SLUG_MAX_LENGTH) return slug;
  return slug.slice(0, SLUG_MAX_LENGTH).replace(/-[^-]*$/, "");
}

/** What the slug field keeps while someone types: lowercase, spaces/underscores become hyphens, invalid characters dropped. */
export function normalizeSlugInput(input: string): string {
  return input.toLowerCase().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-{2,}/g, "-").slice(0, SLUG_MAX_LENGTH);
}
