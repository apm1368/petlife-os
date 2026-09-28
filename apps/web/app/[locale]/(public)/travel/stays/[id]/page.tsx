import { Suspense } from "react";
import type { Metadata } from "next";
import { Skeleton } from "@petlife/ui";
import type { TravelListingDetailDto } from "@petlife/types";
import { TravelListingDetailView } from "@/features/travel-market/TravelListingDetailView";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:4000";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public listing read for metadata only; any failure simply falls back to generic, noindex tags. */
async function fetchListing(id: string): Promise<TravelListingDetailDto | null> {
  if (!UUID.test(id)) return null;
  try {
    const res = await fetch(`${API_ORIGIN}/travel/listings/${id}`, { next: { revalidate: 300 } });
    return res.ok ? ((await res.json()) as TravelListingDetailDto) : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { locale, id } = await params;
  const listing = await fetchListing(id);
  if (!listing) return { title: "PET LIFE", robots: { index: false, follow: false } };
  const fa = locale === "fa";
  const cover = listing.media[0]?.url ?? listing.imageUrls[0];
  return {
    title: `${listing.title} — ${listing.city} | PET LIFE`,
    description: listing.description.slice(0, 160),
    alternates: { canonical: `/${locale}/travel/stays/${id}`, languages: { fa: `/fa/travel/stays/${id}`, en: `/en/travel/stays/${id}` } },
    openGraph: { title: listing.title, description: listing.description.slice(0, 200), images: cover ? [cover] : undefined, locale: fa ? "fa_IR" : "en_US" },
  };
}

/**
 * Structured data states only facts the listing actually has: no invented price range, no rating
 * without real published reviews, and petsAllowed only when the property stated a pet policy.
 */
function jsonLd(l: TravelListingDetailDto) {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": l.type === "HOTEL" || l.type === "PET_FRIENDLY_HOTEL" || l.type === "RESORT" ? "Hotel" : "LodgingBusiness",
    name: l.title,
    description: l.description.slice(0, 500),
    address: { "@type": "PostalAddress", addressLocality: l.city, ...(l.province ? { addressRegion: l.province } : {}), addressCountry: l.country },
  };
  const images = (l.media.length ? l.media.map((m) => m.url) : l.imageUrls).slice(0, 5);
  if (images.length) data.image = images;
  if (l.latitude !== null && l.longitude !== null) data.geo = { "@type": "GeoCoordinates", latitude: l.latitude, longitude: l.longitude };
  if (l.petPolicy) data.petsAllowed = l.petPolicy.dogsAllowed || l.petPolicy.catsAllowed || l.petPolicy.otherAllowed;
  if (l.checkInFrom) data.checkinTime = l.checkInFrom;
  if (l.checkOutUntil) data.checkoutTime = l.checkOutUntil;
  if (l.rating.count > 0 && l.rating.average !== null) data.aggregateRating = { "@type": "AggregateRating", ratingValue: l.rating.average, reviewCount: l.rating.count, bestRating: 5, worstRating: 1 };
  return data;
}

export default async function TravelStayPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { id } = await params;
  const listing = await fetchListing(id);
  return (
    <>
      {listing ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(listing)).replace(/</g, "\\u003c") }} /> : null}
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <TravelListingDetailView listingId={id} />
      </Suspense>
    </>
  );
}
