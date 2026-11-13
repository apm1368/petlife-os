import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { PublicSellerStorefrontDto } from "@petlife/types";
import type { RouteLocale } from "@/lib/i18n/config";
import { localizedAlternates } from "@/lib/seo/public-metadata";
import { OG_LOCALE, absoluteUrl, jsonLdScript } from "@/lib/seo/site";
import { SellerStorefrontView } from "@/features/commerce/SellerStorefrontView";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:4000";
const SLUG = /^[\p{L}\p{N}-]{2,80}$/u;

async function fetchStore(slug: string): Promise<PublicSellerStorefrontDto | null> {
  if (!SLUG.test(slug)) return null;
  try {
    const res = await fetch(`${API_ORIGIN}/shop/sellers/${encodeURIComponent(slug)}`, { next: { revalidate: 300 } });
    return res.ok ? ((await res.json()) as PublicSellerStorefrontDto) : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const store = await fetchStore(decodeURIComponent(slug));
  if (!store) return { title: "opetlife", robots: { index: false, follow: false } };
  const path = `shop/sellers/${store.seller.slug ?? store.seller.id}`;
  const description = (store.seller.description ?? "").slice(0, 160) || undefined;
  return {
    title: `${store.seller.name} | opetlife`,
    description,
    alternates: localizedAlternates(locale as RouteLocale, path),
    // A store with nothing on sale is not worth indexing yet.
    robots: store.total > 0 ? undefined : { index: false, follow: true },
    openGraph: { title: store.seller.name, description, images: store.seller.logoUrl ? [store.seller.logoUrl] : undefined, locale: OG_LOCALE[locale as RouteLocale] },
  };
}

/** Structured data states only what the store has: no rating without published reviews, no invented prices. */
function jsonLd(store: PublicSellerStorefrontDto, locale: string) {
  const url = absoluteUrl(`/${locale}/shop/sellers/${store.seller.slug ?? store.seller.id}`);
  const org: Record<string, unknown> = { "@type": "Store", "@id": `${url}#store`, name: store.seller.name, url };
  if (store.seller.logoUrl) org.logo = store.seller.logoUrl;
  if (store.seller.description) org.description = store.seller.description;
  if (store.seller.city) org.address = { "@type": "PostalAddress", addressLocality: store.seller.city, addressCountry: "IR" };
  if (store.seller.rating && store.seller.rating.count > 0) org.aggregateRating = { "@type": "AggregateRating", ratingValue: store.seller.rating.average, reviewCount: store.seller.rating.count, bestRating: 5 };
  const list = {
    "@type": "ItemList",
    itemListElement: store.products.slice(0, 30).map((p, i) => ({ "@type": "ListItem", position: i + 1, url: absoluteUrl(`/${locale}/shop/products/${p.id}`), name: p.title })),
  };
  return { "@context": "https://schema.org", "@graph": [org, list] };
}

export default async function SellerStorefrontPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const store = await fetchStore(decodeURIComponent(slug));
  if (!store) notFound();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd(store, locale)) }} />
      <SellerStorefrontView store={store} />
    </>
  );
}
