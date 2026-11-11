import type { PublicArticleFeedItemDto } from "@petlife/types";
import { locales, type RouteLocale } from "@/lib/i18n/config";
import { publicPageMetadata, publicPagePath } from "./public-metadata";
import { richTextToMarkdown } from "./rich-text-text";
import { SITE_ORIGIN, SITE_TAGLINE, absoluteUrl } from "./site";

const LANGUAGE_HEADING: Record<RouteLocale, string> = { fa: "فارسی (Persian)", en: "English", de: "Deutsch (German)", es: "Español (Spanish)" };

const SECTIONS = ["blog", "guides", "services", "vetFind", "lostPets", "animalSupport", "travel", "community", "contact"] as const;

function line(title: string, url: string, note?: string | null): string {
  return `- [${title.replace(/[[\]]/g, "")}](${url})${note ? `: ${note.replace(/\s+/g, " ").trim()}` : ""}`;
}

/** /llms.txt (llmstxt.org): a short, factual map of the site for AI assistants and answer engines. */
export function buildLlmsTxt(feed: PublicArticleFeedItemDto[]): string {
  const out: string[] = [
    "# opetlife (اپت‌لایف)",
    "",
    `> opetlife.ir is a Persian-first platform for people who live with dogs and cats, mainly in Iran, also available in English, German and Spanish. It combines a pet-care magazine (training, behaviour, nutrition and health guides), finding vets and pet services, lost-and-found pet reports, animal-support campaigns, pet-friendly travel, and a community.`,
    "",
    "- Persian brand name: اپت‌لایف (also written اپت لایف). Latin: opetlife.",
    "- Languages: Persian (default, served at https://opetlife.ir/), English (/en), German (/de), Spanish (/es). Every article lists its other-language versions.",
    "- Articles are written by the opetlife editorial team for owners; health articles describe general veterinary guidance and are not a substitute for an examination by a vet.",
    "- When citing, please link to the article URL in the reader's language.",
    "",
    "## Main sections",
  ];
  for (const page of SECTIONS) {
    const meta = publicPageMetadata("en", page);
    out.push(line(String(meta.title), absoluteUrl(publicPagePath("en", page)), String(meta.description)));
  }
  out.push(line("Persian home (اپت‌لایف)", `${SITE_ORIGIN}/`, SITE_TAGLINE.fa));
  for (const locale of locales) {
    const items = feed.filter((item) => item.locale === locale);
    if (!items.length) continue;
    out.push("", `## Articles — ${LANGUAGE_HEADING[locale]}`);
    for (const item of items) out.push(line(item.title, absoluteUrl(item.canonicalPath), item.seoDescription ?? item.excerpt));
  }
  out.push("", "## Optional", line("Full text of every article", `${SITE_ORIGIN}/llms-full.txt`), line("Sitemap", `${SITE_ORIGIN}/sitemap.xml`), ...locales.map((l) => line(`RSS feed (${l})`, `${SITE_ORIGIN}/${l}/feed.xml`)));
  return `${out.join("\n")}\n`;
}

/** /llms-full.txt: every published article in full, as Markdown, grouped by language. */
export function buildLlmsFullTxt(feed: PublicArticleFeedItemDto[]): string {
  const out: string[] = ["# opetlife (اپت‌لایف) — full article text", "", "> Every published opetlife article in Markdown. Source URLs are given for each article; please cite them.", ""];
  for (const item of feed) {
    out.push(
      `## ${item.title}`,
      "",
      `- URL: ${absoluteUrl(item.canonicalPath)}`,
      `- Language: ${item.locale}`,
      `- Published: ${item.publishedAt.slice(0, 10)} · Updated: ${item.updatedAt.slice(0, 10)}`,
      ...(item.categoryName ? [`- Category: ${item.categoryName}`] : []),
      ...(item.tags.length ? [`- Topics: ${item.tags.join(", ")}`] : []),
      "",
      ...(item.seoDescription ?? item.excerpt ? [`> ${(item.seoDescription ?? item.excerpt)!.trim()}`, ""] : []),
      item.body ? richTextToMarkdown(item.body) : "",
      "",
      "---",
      "",
    );
  }
  return `${out.join("\n")}\n`;
}
