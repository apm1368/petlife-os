const PERSIAN = /[؀-ۿ]/;

/**
 * Content authors have one name field. A bilingual name is stored as "Persian · Latin" (e.g. the editorial desk:
 * «تحریریهٔ اپت‌لایف · opetlife editorial»); each locale shows only its own half — Persian on /fa, the Latin
 * half everywhere else — so English, German and Spanish pages never carry Persian bylines. Any other name is
 * shown as written.
 */
export function localizedAuthorName(name: string, locale: string): string {
  const parts = name.split(" · ").map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 2) return name;
  const persian = parts.find((part) => PERSIAN.test(part));
  const latin = parts.find((part) => !PERSIAN.test(part));
  if (!persian || !latin) return name;
  return locale === "fa" ? persian : latin;
}
