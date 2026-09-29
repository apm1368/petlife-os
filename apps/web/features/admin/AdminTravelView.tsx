"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { TravelListingDto, TravelListingStatus } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { adminService } from "@/services/admin.service";

const COPY = {
  en: { title: "Travel moderation", subtitle: "Review supply before it becomes discoverable. Every decision is recorded in the audit log.", empty: "No travel listings are waiting for review.", approve: "Publish", suspend: "Suspend", archive: "Archive", verify: "Verify", error: "Travel moderation could not be loaded." },
  fa: { title: "مدیریت سفر", subtitle: "عرضهٔ سفر را پیش از نمایش عمومی بررسی کنید. هر تصمیم در لاگ ممیزی ثبت می‌شود.", empty: "هیچ فهرست سفری برای بررسی وجود ندارد.", approve: "انتشار", suspend: "تعلیق", archive: "بایگانی", verify: "تأیید", error: "بارگذاری مدیریت سفر ممکن نشد." },
} as const;

export function AdminTravelView() {
  const locale = useLocale() === "fa" ? "fa" : "en"; const copy = COPY[locale];
  const [listings, setListings] = useState<TravelListingDto[] | null>(null); const [error, setError] = useState<string | null>(null); const [acting, setActing] = useState<string | null>(null);
  async function load() { setError(null); try { setListings((await adminService.listTravelListings({ pageSize: 100 })).items); } catch (err) { setError(err instanceof ApiError ? err.message : copy.error); } }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  async function act(key: string, work: () => Promise<unknown>) { setActing(key); setError(null); try { await work(); await load(); } catch (err) { setError(err instanceof ApiError ? err.message : copy.error); } finally { setActing(null); } }
  if (error && !listings) return <ErrorRecovery title={copy.title} message={error} retryLabel={locale === "fa" ? "تلاش دوباره" : "Try again"} onRetry={load} />;
  if (!listings) return <Skeleton className="h-64 w-full" aria-label={copy.title} />;
  return <div className="flex flex-col gap-5"><header><h1 className="text-page-title text-text-primary">{copy.title}</h1><p className="text-body text-text-secondary">{copy.subtitle}</p></header>{error ? <p className="text-body text-state-urgent">{error}</p> : null}{listings.length === 0 ? <EmptyState title={copy.empty} /> : <div className="flex flex-col gap-3">{listings.map((listing) => <TravelModerationRow key={listing.id} listing={listing} copy={copy} acting={acting} onAct={act} />)}</div>}</div>;
}

function TravelModerationRow({ listing, copy, acting, onAct }: { listing: TravelListingDto; copy: (typeof COPY)[keyof typeof COPY]; acting: string | null; onAct: (key: string, work: () => Promise<unknown>) => Promise<void> }) {
  const publishable = listing.status === "PENDING_REVIEW" || listing.status === "SUSPENDED";
  const suspendable = listing.status === "PENDING_REVIEW" || listing.status === "PUBLISHED";
  const archivable = listing.status !== "ARCHIVED";
  return <ContextSurface className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-body font-semibold text-text-primary">{listing.title}</p><p className="text-metadata text-text-secondary">{listing.organizationName} · {listing.city}</p></div><div className="flex flex-wrap items-center gap-2"><StatusLabel tone={listing.status === "PUBLISHED" ? "success" : "neutral"}>{listing.status}</StatusLabel>{!listing.isVerified ? <Button size="sm" variant="ghost" isLoading={acting === `${listing.id}-verify`} onClick={() => onAct(`${listing.id}-verify`, () => adminService.setTravelListingVerification(listing.id, true))}>{copy.verify}</Button> : null}{publishable ? <Button size="sm" variant="secondary" isLoading={acting === `${listing.id}-publish`} onClick={() => onAct(`${listing.id}-publish`, () => adminService.moderateTravelListing(listing.id, "PUBLISHED" as TravelListingStatus))}>{copy.approve}</Button> : null}{suspendable ? <Button size="sm" variant="ghost" isLoading={acting === `${listing.id}-suspend`} onClick={() => onAct(`${listing.id}-suspend`, () => adminService.moderateTravelListing(listing.id, "SUSPENDED" as TravelListingStatus))}>{copy.suspend}</Button> : null}{archivable ? <Button size="sm" variant="ghost" isLoading={acting === `${listing.id}-archive`} onClick={() => onAct(`${listing.id}-archive`, () => adminService.moderateTravelListing(listing.id, "ARCHIVED" as TravelListingStatus))}>{copy.archive}</Button> : null}</div></ContextSurface>;
}
