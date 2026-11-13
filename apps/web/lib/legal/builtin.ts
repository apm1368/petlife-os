import type { RouteLocale } from "@/lib/i18n/config";
import termsFa from "@/content/legal/terms.fa.json";
import termsEn from "@/content/legal/terms.en.json";
import termsDe from "@/content/legal/terms.de.json";
import termsEs from "@/content/legal/terms.es.json";
import termsAr from "@/content/legal/terms.ar.json";
import termsNl from "@/content/legal/terms.nl.json";
import privacyFa from "@/content/legal/privacy.fa.json";
import privacyEn from "@/content/legal/privacy.en.json";
import privacyDe from "@/content/legal/privacy.de.json";
import privacyEs from "@/content/legal/privacy.es.json";
import privacyAr from "@/content/legal/privacy.ar.json";
import privacyNl from "@/content/legal/privacy.nl.json";
import faqFa from "@/content/legal/faq.fa.json";
import faqEn from "@/content/legal/faq.en.json";
import faqDe from "@/content/legal/faq.de.json";
import faqEs from "@/content/legal/faq.es.json";
import faqAr from "@/content/legal/faq.ar.json";
import faqNl from "@/content/legal/faq.nl.json";

/**
 * The built-in Terms, Privacy Policy and FAQ, written from how the platform actually works (code and the
 * owner's decision log) and kept in the repository in all six languages. They are drafts awaiting the
 * owner's legal review: a version the owner publishes for a language in Admin → Help center → Legal
 * replaces the built-in text for that language. Server-only: never import this from a client component.
 */
export interface LegalSection {
  id: string;
  heading: string;
  paragraphs?: string[];
  items?: string[];
  links?: { label: string; href: string }[];
}

export interface BuiltinLegalDocument {
  title: string;
  lede: string;
  updated: string;
  sections: LegalSection[];
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface BuiltinFaq {
  title: string;
  lede: string;
  updated: string;
  groups: { id: string; heading: string; items: FaqItem[] }[];
}

export const BUILTIN_LEGAL_SLUGS = ["terms", "privacy"] as const;
export type BuiltinLegalSlug = (typeof BUILTIN_LEGAL_SLUGS)[number];

const LEGAL: Record<BuiltinLegalSlug, Record<RouteLocale, BuiltinLegalDocument>> = {
  terms: { fa: termsFa, en: termsEn, de: termsDe, es: termsEs, ar: termsAr, nl: termsNl },
  privacy: { fa: privacyFa, en: privacyEn, de: privacyDe, es: privacyEs, ar: privacyAr, nl: privacyNl },
};

const FAQ: Record<RouteLocale, BuiltinFaq> = { fa: faqFa, en: faqEn, de: faqDe, es: faqEs, ar: faqAr, nl: faqNl };

export function isBuiltinLegalSlug(slug: string): slug is BuiltinLegalSlug {
  return (BUILTIN_LEGAL_SLUGS as readonly string[]).includes(slug);
}

export function builtinLegalDocument(slug: BuiltinLegalSlug, locale: RouteLocale): BuiltinLegalDocument {
  return LEGAL[slug][locale];
}

export function builtinFaq(locale: RouteLocale): BuiltinFaq {
  return FAQ[locale];
}

/** schema.org FAQPage for the built-in questions (rich results for "frequently asked questions"). */
export function faqPageJsonLd(faq: BuiltinFaq, url: string) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url,
    name: faq.title,
    mainEntity: faq.groups.flatMap((group) => group.items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    }))),
  };
}
