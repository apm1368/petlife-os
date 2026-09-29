"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import type { TravelBookingDto, TravelListingDto, TravelProviderCalendarDto, TravelProviderFinanceDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { addDays, formatDay, localizeDigits, todayIso } from "@/lib/date/jalali";
import { DateRangeField, type DateRangeValue } from "@/features/shared/date-picker/DateRangePicker";
import { travelProviderService, type ProviderTravelReviewRow, type RatePlanInput } from "@/services/travel-marketplace.service";
import { AMENITY, amenityLabel, bookingStatusLabel, bookingStatusTone, cancellationSummary, LISTING_TYPE, listingTypeLabel, money, paymentStatusLabel, paymentTimingSummary, stayDates } from "@/features/travel-market/labels";

type Lang = "fa" | "en";
const useLang = () => {
  const lang = useLocale() as Lang;
  return { lang, fa: lang === "fa" };
};

const LISTING_STATUS: Record<string, [string, string, "neutral" | "attention" | "success" | "higherConcern"]> = {
  DRAFT: ["پیش‌نویس", "Draft", "neutral"],
  PENDING_REVIEW: ["در انتظار بررسی PET LIFE", "Awaiting PET LIFE review", "attention"],
  PUBLISHED: ["منتشر شده", "Published", "success"],
  SUSPENDED: ["معلق", "Suspended", "higherConcern"],
  ARCHIVED: ["بایگانی", "Archived", "neutral"],
};

function errorText(e: unknown, fa: boolean): string {
  if (e instanceof ApiError) {
    if (e.status === 403) return fa ? "این کار فقط برای مالک حساب مجاز است." : "Only the account owner can do this.";
    const reason = e.details?.reason as string | undefined;
    if (reason) return fa ? `انجام نشد (${reason}).` : `Not saved (${reason}).`;
  }
  return fa ? "ذخیره نشد. دوباره تلاش کنید." : "Could not save. Please try again.";
}

export function ProviderTravelNav() {
  const { lang, fa } = useLang();
  const pathname = usePathname() ?? "";
  const items = [
    ["", fa ? "اقامتگاه‌ها" : "Listings"],
    ["/bookings", fa ? "رزروها" : "Bookings"],
    ["/reviews", fa ? "نظرات" : "Reviews"],
    ["/finance", fa ? "مالی" : "Finance"],
  ] as const;
  return (
    <nav aria-label={fa ? "سفر و اقامت" : "Travel"} className="flex gap-2 overflow-x-auto border-b border-border-subtle pb-2">
      {items.map(([href, label]) => {
        const full = `/${lang}/provider/travel${href}`;
        const active = href === "" ? pathname === full || pathname.startsWith(`${full}/listings`) : pathname.startsWith(full);
        return <Link key={href} href={full} aria-current={active ? "page" : undefined} className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${active ? "bg-surface-subtle font-bold text-text-primary" : "text-text-secondary"}`}>{label}</Link>;
      })}
    </nav>
  );
}

/** TRAVEL PROVIDER OPERATIONAL PATTERN — listings overview. */
export function ProviderTravelHomeView() {
  const { lang, fa } = useLang();
  const router = useRouter();
  const [listings, setListings] = useState<TravelListingDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ type: "HOTEL", title: "", description: "", city: "", province: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    travelProviderService.listings().then((r) => setListings(r.items)).catch((e) => setError(e instanceof ApiError && e.status === 403 ? "forbidden" : "error"));
  }, []);
  useEffect(load, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const l = await travelProviderService.create({ type: form.type as TravelListingDto["type"], title: form.title.trim(), description: form.description.trim(), city: form.city.trim(), province: form.province.trim() || undefined, country: "IR" });
      router.push(`/${lang}/provider/travel/listings/${l.id}`);
    } catch (e) {
      setError(errorText(e, fa));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <ProviderTravelNav />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-page-title text-text-primary">{fa ? "اقامتگاه‌های شما" : "Your listings"}</h1>
        <Button onClick={() => setCreating(!creating)}>{fa ? "اقامتگاه جدید" : "New listing"}</Button>
      </div>
      {creating ? (
        <ContextSurface className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">{fa ? "نوع" : "Type"}
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="min-h-11 rounded-md border border-border-subtle bg-surface-base px-2">
              {Object.keys(LISTING_TYPE).filter((t) => !["PET_TAXI", "INTERCITY_TRANSPORT"].includes(t)).map((t) => <option key={t} value={t}>{listingTypeLabel(t, lang)}</option>)}
            </select>
          </label>
          <Input dir="auto" label={fa ? "عنوان" : "Title"} value={form.title} maxLength={160} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <label className="flex flex-col gap-1 text-sm">{fa ? "توضیحات (حداقل ۲۰ حرف)" : "Description (at least 20 characters)"}<textarea dir="auto" value={form.description} maxLength={6000} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-24 rounded-md border border-border-subtle bg-surface-base p-2" /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input dir="auto" label={fa ? "شهر" : "City"} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <Input dir="auto" label={fa ? "استان" : "Province"} value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} />
          </div>
          {error && error !== "forbidden" && error !== "error" ? <p role="alert" className="text-sm text-state-urgent">{error}</p> : null}
          <Button isLoading={busy} disabled={form.title.trim().length < 3 || form.description.trim().length < 20 || form.city.trim().length < 2} onClick={() => void create()}>{fa ? "ساخت پیش‌نویس" : "Create draft"}</Button>
        </ContextSurface>
      ) : null}
      {error === "forbidden" ? <EmptyState title={fa ? "دسترسی ندارید" : "No access"} description={fa ? "این بخش برای اعضای حساب اقامتگاه است." : "This area is for members of a travel partner account."} /> : error === "error" ? <ErrorRecovery title={fa ? "بارگیری نشد" : "Could not load"} message={fa ? "دوباره تلاش کنید." : "Please try again."} retryLabel={fa ? "تلاش دوباره" : "Try again"} onRetry={load} /> : listings === null ? <Skeleton className="h-40" /> : listings.length === 0 ? (
        <EmptyState title={fa ? "هنوز اقامتگاهی ثبت نکرده‌اید" : "No listings yet"} description={fa ? "پیش‌نویس بسازید، اتاق‌ها، نرخ‌ها و قوانین حیوانات را کامل کنید و برای بررسی بفرستید." : "Create a draft, add rooms, rates and pet rules, then submit it for review."} />
      ) : (
        <ul className="flex flex-col gap-3">
          {listings.map((l) => {
            const st = LISTING_STATUS[l.status] ?? [l.status, l.status, "neutral"];
            return (
              <li key={l.id}>
                <Link href={`/${lang}/provider/travel/listings/${l.id}`} className="flex flex-col gap-1 rounded-md border border-border-subtle bg-surface-elevated p-4 hover:border-border-strong">
                  <span className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold">{l.title}</span><StatusLabel tone={st[2]}>{fa ? st[0] : st[1]}</StatusLabel></span>
                  <span className="text-sm text-text-secondary">{listingTypeLabel(l.type, lang)} · {l.city} · {fa ? `${localizeDigits(l.units.length, "fa")} اتاق` : `${l.units.length} room type${l.units.length === 1 ? "" : "s"}`}{l.petPolicy ? "" : fa ? " · قوانین حیوانات ثبت نشده" : " · no pet policy yet"}</span>
                  {l.moderationNote && l.status === "DRAFT" ? <span className="text-sm text-state-attention">{fa ? "درخواست اصلاح: " : "Correction requested: "}{l.moderationNote}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type Tab = "details" | "policy" | "rooms" | "photos" | "calendar";

/** Listing editor. Each tab saves on its own; submission needs a pet policy and at least one room. */
export function ProviderTravelListingEditor({ listingId }: { listingId: string }) {
  const { lang, fa } = useLang();
  const [listing, setListing] = useState<TravelListingDto | null>(null);
  const [load, setLoad] = useState<"loading" | "ready" | "error" | "notFound">("loading");
  const [tab, setTab] = useState<Tab>("details");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchListing = useCallback(async () => {
    try {
      setListing(await travelProviderService.listing(listingId));
      setLoad("ready");
    } catch (e) {
      setLoad(e instanceof ApiError && (e.status === 404 || e.status === 403) ? "notFound" : "error");
    }
  }, [listingId]);
  useEffect(() => void fetchListing(), [fetchListing]);

  const save = async (fn: () => Promise<TravelListingDto | unknown>, ok?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fn();
      if (res && typeof res === "object" && "units" in (res as object)) setListing(res as TravelListingDto);
      else await fetchListing();
      setMsg({ ok: true, text: ok ?? (fa ? "ذخیره شد." : "Saved.") });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e, fa) });
    } finally {
      setBusy(false);
    }
  };

  if (load === "loading") return <Skeleton className="h-96" />;
  if (load === "notFound") return <EmptyState title={fa ? "این اقامتگاه پیدا نشد" : "Listing not found"} />;
  if (load === "error" || !listing) return <ErrorRecovery title={fa ? "بارگیری نشد" : "Could not load"} message={fa ? "دوباره تلاش کنید." : "Please try again."} retryLabel={fa ? "تلاش دوباره" : "Try again"} onRetry={() => void fetchListing()} />;
  const st = LISTING_STATUS[listing.status] ?? [listing.status, listing.status, "neutral"];
  const tabs: [Tab, string][] = [["details", fa ? "مشخصات" : "Details"], ["policy", fa ? "قوانین حیوانات" : "Pet policy"], ["rooms", fa ? "اتاق‌ها و نرخ‌ها" : "Rooms & rates"], ["photos", fa ? "تصاویر" : "Photos"], ["calendar", fa ? "تقویم" : "Calendar"]];
  const missing = [!listing.petPolicy && (fa ? "قوانین حیوانات" : "pet policy"), !listing.units.some((u) => u.isActive) && (fa ? "حداقل یک اتاق فعال" : "at least one active room")].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-5">
      <ProviderTravelNav />
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2"><StatusLabel tone={st[2]}>{fa ? st[0] : st[1]}</StatusLabel>{listing.isVerified ? <span className="text-metadata text-state-success">{fa ? "تأییدشده" : "Verified"}</span> : null}</div>
        <h1 className="text-page-title">{listing.title}</h1>
        {listing.moderationNote && listing.status === "DRAFT" ? <p className="rounded-md bg-state-attention/10 p-3 text-sm text-state-attention">{fa ? "یادداشت بررسی PET LIFE: " : "PET LIFE review note: "}{listing.moderationNote}</p> : null}
        <div className="flex flex-wrap gap-2">
          {listing.status === "DRAFT" ? <Button size="sm" disabled={missing.length > 0} isLoading={busy} onClick={() => void save(() => travelProviderService.submit(listing.id), fa ? "برای بررسی ارسال شد." : "Submitted for review.")}>{fa ? "ارسال برای بررسی" : "Submit for review"}</Button> : null}
          {listing.status === "PENDING_REVIEW" ? <Button size="sm" variant="secondary" isLoading={busy} onClick={() => void save(() => travelProviderService.withdraw(listing.id), fa ? "به پیش‌نویس برگشت." : "Back to draft.")}>{fa ? "بازگشت به پیش‌نویس" : "Withdraw to draft"}</Button> : null}
          {listing.status === "PUBLISHED" ? <Link className="text-sm underline" href={`/${lang}/travel/stays/${listing.id}`}>{fa ? "مشاهدهٔ صفحهٔ عمومی" : "View public page"}</Link> : null}
        </div>
        {listing.status === "DRAFT" && missing.length ? <p className="text-metadata text-text-secondary">{fa ? `برای ارسال لازم است: ${missing.join("، ")}` : `Needed before submitting: ${missing.join(", ")}`}</p> : null}
      </header>
      {msg ? <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-state-success" : "text-state-urgent"}`}>{msg.text}</p> : null}
      <div role="tablist" className="flex gap-2 overflow-x-auto">
        {tabs.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setMsg(null); }} className={`min-h-11 shrink-0 rounded-full px-4 text-sm ${tab === k ? "bg-surface-subtle font-bold" : "text-text-secondary"}`}>{label}</button>)}
      </div>
      <div role="tabpanel">
        {tab === "details" ? <DetailsTab listing={listing} busy={busy} onSave={(v) => void save(() => travelProviderService.update(listing.id, v))} /> : null}
        {tab === "policy" ? <PolicyTab listing={listing} busy={busy} onSave={(v) => void save(() => travelProviderService.petPolicy(listing.id, v))} /> : null}
        {tab === "rooms" ? <RoomsTab listing={listing} busy={busy} save={save} /> : null}
        {tab === "photos" ? <PhotosTab listing={listing} busy={busy} save={save} /> : null}
        {tab === "calendar" ? <CalendarTab listing={listing} busy={busy} save={save} /> : null}
      </div>
    </div>
  );
}

function DetailsTab({ listing, busy, onSave }: { listing: TravelListingDto; busy: boolean; onSave: (v: Parameters<typeof travelProviderService.update>[1]) => void }) {
  const { lang, fa } = useLang();
  const [v, setV] = useState({ title: listing.title, description: listing.description, city: listing.city, province: listing.province ?? "", address: listing.address ?? "", checkInFrom: listing.checkInFrom ?? "", checkOutUntil: listing.checkOutUntil ?? "", houseRules: listing.houseRules ?? "", cancellationPolicy: listing.cancellationPolicy ?? "", bookingMode: listing.bookingMode as string, amenities: listing.amenities, latitude: listing.latitude?.toString() ?? "", longitude: listing.longitude?.toString() ?? "" });
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  return (
    <ContextSurface className="flex flex-col gap-3">
      <Input dir="auto" label={fa ? "عنوان" : "Title"} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
      <label className="flex flex-col gap-1 text-sm">{fa ? "توضیحات" : "Description"}<textarea dir="auto" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} className="min-h-32 rounded-md border border-border-subtle bg-surface-base p-2" /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input dir="auto" label={fa ? "استان" : "Province"} value={v.province} onChange={(e) => setV({ ...v, province: e.target.value })} />
        <Input dir="auto" label={fa ? "نشانی" : "Address"} value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} />
        <Input label={fa ? "عرض جغرافیایی" : "Latitude"} inputMode="decimal" value={v.latitude} onChange={(e) => setV({ ...v, latitude: e.target.value })} hint={fa ? "برای فاصله تا مکان‌ها و دامپزشکان" : "Used for distances to places and vets"} />
        <Input label={fa ? "طول جغرافیایی" : "Longitude"} inputMode="decimal" value={v.longitude} onChange={(e) => setV({ ...v, longitude: e.target.value })} />
        <Input label={fa ? "ساعت ورود از (HH:MM)" : "Check-in from (HH:MM)"} dir="ltr" value={v.checkInFrom} onChange={(e) => setV({ ...v, checkInFrom: e.target.value })} errorMessage={v.checkInFrom && !time.test(v.checkInFrom) ? (fa ? "مثلاً 14:00" : "e.g. 14:00") : undefined} />
        <Input label={fa ? "ساعت خروج تا (HH:MM)" : "Check-out until (HH:MM)"} dir="ltr" value={v.checkOutUntil} onChange={(e) => setV({ ...v, checkOutUntil: e.target.value })} errorMessage={v.checkOutUntil && !time.test(v.checkOutUntil) ? (fa ? "مثلاً 12:00" : "e.g. 12:00") : undefined} />
      </div>
      <label className="flex flex-col gap-1 text-sm">{fa ? "نوع رزرو" : "Booking mode"}
        <select value={v.bookingMode} onChange={(e) => setV({ ...v, bookingMode: e.target.value })} className="min-h-11 rounded-md border border-border-subtle bg-surface-base px-2">
          <option value="INSTANT_BOOKING">{fa ? "رزرو فوری" : "Instant booking"}</option>
          <option value="REQUEST_TO_BOOK">{fa ? "درخواست و تأیید (۲۴ ساعت مهلت پاسخ)" : "Request to book (24h to respond)"}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">{fa ? "قوانین اقامتگاه" : "House rules"}<textarea dir="auto" value={v.houseRules} maxLength={2000} onChange={(e) => setV({ ...v, houseRules: e.target.value })} className="min-h-20 rounded-md border border-border-subtle bg-surface-base p-2" /></label>
      <label className="flex flex-col gap-1 text-sm">{fa ? "شرایط لغو عمومی (برای اتاق‌های بدون نرخ)" : "General cancellation terms (rooms without rate plans)"}<textarea dir="auto" value={v.cancellationPolicy} onChange={(e) => setV({ ...v, cancellationPolicy: e.target.value })} className="min-h-16 rounded-md border border-border-subtle bg-surface-base p-2" /></label>
      <fieldset className="flex flex-wrap gap-2"><legend className="mb-1 text-sm font-medium">{fa ? "امکانات" : "Amenities"}</legend>
        {Object.keys(AMENITY).map((a) => { const on = v.amenities.includes(a); return <button type="button" key={a} aria-pressed={on} onClick={() => setV({ ...v, amenities: on ? v.amenities.filter((x) => x !== a) : [...v.amenities, a] })} className={`min-h-10 rounded-full border px-3 text-sm ${on ? "border-brand-natural bg-brand-natural/10" : "border-border-subtle text-text-secondary"}`}>{amenityLabel(a, lang)}</button>; })}
      </fieldset>
      <Button isLoading={busy} disabled={(!!v.checkInFrom && !time.test(v.checkInFrom)) || (!!v.checkOutUntil && !time.test(v.checkOutUntil))} onClick={() => onSave({
        title: v.title.trim(), description: v.description.trim(), province: v.province.trim() || undefined, address: v.address.trim() || undefined,
        checkInFrom: v.checkInFrom || undefined, checkOutUntil: v.checkOutUntil || undefined, houseRules: v.houseRules.trim() || undefined, cancellationPolicy: v.cancellationPolicy.trim() || undefined,
        bookingMode: v.bookingMode as "INSTANT_BOOKING" | "REQUEST_TO_BOOK", amenities: v.amenities,
        latitude: v.latitude ? Number(v.latitude) : undefined, longitude: v.longitude ? Number(v.longitude) : undefined,
      })}>{fa ? "ذخیرهٔ مشخصات" : "Save details"}</Button>
    </ContextSurface>
  );
}

function PolicyTab({ listing, busy, onSave }: { listing: TravelListingDto; busy: boolean; onSave: (v: Parameters<typeof travelProviderService.petPolicy>[1]) => void }) {
  const { fa } = useLang();
  const p = listing.petPolicy;
  const [v, setV] = useState({ dogsAllowed: p?.dogsAllowed ?? true, catsAllowed: p?.catsAllowed ?? false, otherAllowed: p?.otherAllowed ?? false, maxPets: p?.maxPets?.toString() ?? "", maxWeightKg: p?.maxWeightKg?.toString() ?? "", petFeeIrr: p?.petFeeIrr !== null && p?.petFeeIrr !== undefined ? String(p.petFeeIrr / 10) : "", depositIrr: p?.depositIrr ? String(p.depositIrr / 10) : "", vaccinationRequired: p?.vaccinationRequired ?? false, healthCertificateRequired: p?.healthCertificateRequired ?? false, leashRequired: p?.leashRequired ?? false, carrierRequired: p?.carrierRequired ?? false, breedRestrictions: p?.breedRestrictions.join("، ") ?? "", restrictedAreas: p?.restrictedAreas ?? "", notes: p?.notes ?? "" });
  const box = (k: keyof typeof v, label: string) => <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={v[k] as boolean} onChange={(e) => setV({ ...v, [k]: e.target.checked })} />{label}</label>;
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
  return (
    <ContextSurface className="flex flex-col gap-3">
      <p className="text-sm text-text-secondary">{fa ? "آنچه اینجا می‌نویسید دقیقاً همان است که مسافران می‌بینند و با حیوانشان مقایسه می‌شود. هر فیلدی را خالی بگذارید، «اعلام نشده» نمایش داده می‌شود." : "Travellers see exactly what you state here, and it is compared with their pet. Anything left blank is shown as “Not specified”."}</p>
      <div className="grid gap-1 sm:grid-cols-2">
        {box("dogsAllowed", fa ? "سگ پذیرفته می‌شود" : "Dogs accepted")}{box("catsAllowed", fa ? "گربه پذیرفته می‌شود" : "Cats accepted")}{box("otherAllowed", fa ? "سایر حیوانات" : "Other pets")}
        {box("vaccinationRequired", fa ? "مدرک واکسن لازم است" : "Vaccination proof required")}{box("healthCertificateRequired", fa ? "گواهی سلامت لازم است" : "Health certificate required")}{box("leashRequired", fa ? "قلاده در فضاهای عمومی" : "Leash in shared areas")}{box("carrierRequired", fa ? "باکس حمل الزامی" : "Carrier required")}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label={fa ? "حداکثر تعداد حیوان" : "Maximum pets"} inputMode="numeric" value={v.maxPets} onChange={(e) => setV({ ...v, maxPets: e.target.value.replace(/\D/g, "") })} />
        <Input label={fa ? "حداکثر وزن (کیلوگرم)" : "Maximum weight (kg)"} inputMode="decimal" value={v.maxWeightKg} onChange={(e) => setV({ ...v, maxWeightKg: e.target.value.replace(/[^\d.]/g, "") })} />
        <Input label={fa ? "هزینهٔ حیوان برای هر حیوان در هر اقامت (تومان) — ۰ یعنی رایگان" : "Pet fee per pet per stay (Toman) — 0 means free"} inputMode="numeric" value={v.petFeeIrr} onChange={(e) => setV({ ...v, petFeeIrr: e.target.value.replace(/\D/g, "") })} />
        <Input label={fa ? "ودیعهٔ حیوان (تومان)" : "Pet deposit (Toman)"} inputMode="numeric" value={v.depositIrr} onChange={(e) => setV({ ...v, depositIrr: e.target.value.replace(/\D/g, "") })} />
      </div>
      <Input dir="auto" label={fa ? "نژادهای محدود (با ویرگول جدا کنید)" : "Restricted breeds (comma separated)"} value={v.breedRestrictions} onChange={(e) => setV({ ...v, breedRestrictions: e.target.value })} />
      <Input dir="auto" label={fa ? "فضاهای ممنوع برای حیوان" : "Areas pets may not enter"} value={v.restrictedAreas} onChange={(e) => setV({ ...v, restrictedAreas: e.target.value })} />
      <label className="flex flex-col gap-1 text-sm">{fa ? "توضیحات" : "Notes"}<textarea dir="auto" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} className="min-h-16 rounded-md border border-border-subtle bg-surface-base p-2" /></label>
      <Button isLoading={busy} onClick={() => onSave({
        dogsAllowed: v.dogsAllowed, catsAllowed: v.catsAllowed, otherAllowed: v.otherAllowed, vaccinationRequired: v.vaccinationRequired, healthCertificateRequired: v.healthCertificateRequired, leashRequired: v.leashRequired, carrierRequired: v.carrierRequired,
        maxPets: num(v.maxPets), maxWeightKg: num(v.maxWeightKg), petFeeIrr: v.petFeeIrr === "" ? undefined : Number(v.petFeeIrr) * 10, depositIrr: v.depositIrr === "" ? undefined : Number(v.depositIrr) * 10,
        breedRestrictions: v.breedRestrictions.split(/[,،]/).map((x) => x.trim()).filter(Boolean), restrictedAreas: v.restrictedAreas.trim() || undefined, notes: v.notes.trim() || undefined,
      })}>{fa ? "ذخیرهٔ قوانین حیوانات" : "Save pet policy"}</Button>
    </ContextSurface>
  );
}

type SaveFn = (fn: () => Promise<TravelListingDto | unknown>, ok?: string) => Promise<void>;

function RoomsTab({ listing, busy, save }: { listing: TravelListingDto; busy: boolean; save: SaveFn }) {
  const { lang, fa } = useLang();
  const [room, setRoom] = useState({ name: "", quantity: "1", maxOccupancy: "2", basePrice: "", maxPets: "", bedInfo: "" });
  const [planFor, setPlanFor] = useState<string | null>(null);
  const [plan, setPlan] = useState<RatePlanInput & { depositPercent?: number }>({ name: "", cancellationType: "FREE_UNTIL", freeCancellationDays: 3, lateRefundPercent: 0, paymentTiming: "PAY_NOW", priceModifierPercent: 0 });
  return (
    <div className="flex flex-col gap-4">
      {listing.units.map((u) => (
        <ContextSurface key={u.id} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold">{u.name}{u.isActive ? "" : fa ? " (غیرفعال)" : " (inactive)"}</span>
            <span className="text-sm text-text-secondary">{fa ? `${localizeDigits(u.quantity, "fa")} واحد · ${money(u.basePriceIrr, lang)} هر شب` : `${u.quantity} unit${u.quantity === 1 ? "" : "s"} · ${money(u.basePriceIrr, lang)} / night`}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" isLoading={busy} onClick={() => void save(() => travelProviderService.updateUnit(listing.id, u.id, { isActive: !u.isActive }))}>{u.isActive ? (fa ? "غیرفعال کردن" : "Deactivate") : fa ? "فعال کردن" : "Activate"}</Button>
            <Button size="sm" variant="secondary" onClick={() => setPlanFor(planFor === u.id ? null : u.id)}>{fa ? "نرخ جدید" : "New rate plan"}</Button>
          </div>
          {u.ratePlans.length ? (
            <ul className="flex flex-col gap-1 text-sm">{u.ratePlans.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-subtle p-2">
                <span><span className="font-bold">{p.name}</span>{p.priceModifierPercent ? ` (${localizeDigits(p.priceModifierPercent, lang)}٪)` : ""} · {cancellationSummary(p, lang)} · {paymentTimingSummary(p, lang)}</span>
                <Button size="sm" variant="ghost" isLoading={busy} onClick={() => void save(() => travelProviderService.updateRatePlan(listing.id, u.id, p.id, { isActive: !p.isActive }))}>{p.isActive ? (fa ? "توقف" : "Pause") : fa ? "فعال‌سازی" : "Activate"}</Button>
              </li>
            ))}</ul>
          ) : <p className="text-metadata text-text-secondary">{fa ? "بدون نرخ؛ قیمت پایه و شرایط لغو عمومی اعمال می‌شود." : "No rate plans; the base price and general cancellation terms apply."}</p>}
          {planFor === u.id ? (
            <div className="grid gap-3 rounded-md border border-border-subtle p-3 sm:grid-cols-2">
              <Input dir="auto" label={fa ? "نام نرخ" : "Rate name"} value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} />
              <Input label={fa ? "تغییر قیمت نسبت به پایه (٪)" : "Price change vs base (%)"} inputMode="numeric" value={String(plan.priceModifierPercent ?? 0)} onChange={(e) => setPlan({ ...plan, priceModifierPercent: Number(e.target.value.replace(/[^\d-]/g, "")) || 0 })} />
              <label className="flex flex-col gap-1 text-sm">{fa ? "شرایط لغو" : "Cancellation"}
                <select value={plan.cancellationType} onChange={(e) => setPlan({ ...plan, cancellationType: e.target.value as RatePlanInput["cancellationType"] })} className="min-h-11 rounded-md border border-border-subtle bg-surface-base px-2">
                  <option value="FREE_UNTIL">{fa ? "لغو رایگان تا چند روز قبل" : "Free until N days before"}</option>
                  <option value="PARTIAL">{fa ? "بازپرداخت درصدی" : "Partial refund"}</option>
                  <option value="NON_REFUNDABLE">{fa ? "غیرقابل استرداد" : "Non-refundable"}</option>
                </select>
              </label>
              {plan.cancellationType === "FREE_UNTIL" ? <Input label={fa ? "روزهای لغو رایگان پیش از ورود" : "Free-cancellation days before check-in"} inputMode="numeric" value={String(plan.freeCancellationDays ?? 0)} onChange={(e) => setPlan({ ...plan, freeCancellationDays: Number(e.target.value.replace(/\D/g, "")) || 0 })} /> : null}
              {plan.cancellationType !== "NON_REFUNDABLE" ? <Input label={fa ? "درصد بازپرداخت دیرهنگام" : "Late refund %"} inputMode="numeric" value={String(plan.lateRefundPercent ?? 0)} onChange={(e) => setPlan({ ...plan, lateRefundPercent: Math.min(100, Number(e.target.value.replace(/\D/g, "")) || 0) })} /> : null}
              <label className="flex flex-col gap-1 text-sm">{fa ? "زمان پرداخت" : "Payment timing"}
                <select value={plan.paymentTiming} onChange={(e) => setPlan({ ...plan, paymentTiming: e.target.value as RatePlanInput["paymentTiming"] })} className="min-h-11 rounded-md border border-border-subtle bg-surface-base px-2">
                  <option value="PAY_NOW">{fa ? "پرداخت کامل آنلاین" : "Pay in full online"}</option>
                  <option value="DEPOSIT">{fa ? "پیش‌پرداخت" : "Deposit"}</option>
                  <option value="PAY_AT_PROPERTY">{fa ? "پرداخت در محل" : "Pay at the property"}</option>
                </select>
              </label>
              {plan.paymentTiming === "DEPOSIT" ? <Input label={fa ? "درصد پیش‌پرداخت" : "Deposit %"} inputMode="numeric" value={String(plan.depositPercent ?? "")} onChange={(e) => setPlan({ ...plan, depositPercent: Math.min(100, Number(e.target.value.replace(/\D/g, "")) || 0) })} /> : null}
              <Input label={fa ? "حداقل شب (اختیاری)" : "Minimum nights (optional)"} inputMode="numeric" value={String(plan.minNights ?? "")} onChange={(e) => setPlan({ ...plan, minNights: Number(e.target.value.replace(/\D/g, "")) || undefined })} />
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={!!plan.includesBreakfast} onChange={(e) => setPlan({ ...plan, includesBreakfast: e.target.checked })} />{fa ? "با صبحانه" : "Breakfast included"}</label>
              <Button className="sm:col-span-2" isLoading={busy} disabled={plan.name.trim().length < 2 || (plan.paymentTiming === "DEPOSIT" && !plan.depositPercent)} onClick={() => void save(async () => { const r = await travelProviderService.createRatePlan(listing.id, u.id, { ...plan, name: plan.name.trim() }); setPlanFor(null); return r; })}>{fa ? "افزودن نرخ" : "Add rate plan"}</Button>
            </div>
          ) : null}
        </ContextSurface>
      ))}
      <ContextSurface className="grid gap-3 sm:grid-cols-2">
        <h3 className="font-bold sm:col-span-2">{fa ? "افزودن نوع اتاق" : "Add a room type"}</h3>
        <Input dir="auto" label={fa ? "نام" : "Name"} value={room.name} onChange={(e) => setRoom({ ...room, name: e.target.value })} />
        <Input label={fa ? "تعداد واحدهای مشابه" : "Identical units"} inputMode="numeric" value={room.quantity} onChange={(e) => setRoom({ ...room, quantity: e.target.value.replace(/\D/g, "") })} />
        <Input label={fa ? "حداکثر نفرات" : "Max guests"} inputMode="numeric" value={room.maxOccupancy} onChange={(e) => setRoom({ ...room, maxOccupancy: e.target.value.replace(/\D/g, "") })} />
        <Input label={fa ? "قیمت پایهٔ هر شب (تومان)" : "Base price per night (Toman)"} inputMode="numeric" value={room.basePrice} onChange={(e) => setRoom({ ...room, basePrice: e.target.value.replace(/\D/g, "") })} />
        <Input label={fa ? "حداکثر حیوان در این اتاق" : "Max pets in this room"} inputMode="numeric" value={room.maxPets} onChange={(e) => setRoom({ ...room, maxPets: e.target.value.replace(/\D/g, "") })} />
        <Input dir="auto" label={fa ? "تخت‌ها" : "Beds"} value={room.bedInfo} onChange={(e) => setRoom({ ...room, bedInfo: e.target.value })} />
        <Button className="sm:col-span-2" isLoading={busy} disabled={room.name.trim().length < 2 || !room.basePrice} onClick={() => void save(async () => { const r = await travelProviderService.createUnit(listing.id, { name: room.name.trim(), quantity: Number(room.quantity) || 1, maxOccupancy: Number(room.maxOccupancy) || undefined, basePriceIrr: Number(room.basePrice) * 10, maxPets: room.maxPets ? Number(room.maxPets) : undefined, bedInfo: room.bedInfo.trim() || undefined }); setRoom({ name: "", quantity: "1", maxOccupancy: "2", basePrice: "", maxPets: "", bedInfo: "" }); return r; })}>{fa ? "افزودن اتاق" : "Add room"}</Button>
      </ContextSurface>
    </div>
  );
}

function PhotosTab({ listing, busy, save }: { listing: TravelListingDto; busy: boolean; save: SaveFn }) {
  const { fa } = useLang();
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const valid = /^(\/images\/[\w\-/.]+|https:\/\/[\w\-.]+\/[\w\-/.%]+)$/.test(url);
  return (
    <div className="flex flex-col gap-4">
      {listing.media.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {listing.media.map((m) => (
            <li key={m.id} className="flex flex-col gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.alt ?? ""} className="aspect-[4/3] w-full rounded-md object-cover" />
              <Button size="sm" variant="ghost" isLoading={busy} onClick={() => void save(() => travelProviderService.removeMedia(listing.id, m.id))}>{fa ? "حذف" : "Remove"}</Button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-text-secondary">{fa ? "هنوز تصویری اضافه نشده است." : "No photos yet."}</p>}
      <ContextSurface className="flex flex-col gap-3">
        <p className="text-sm text-text-secondary">{fa ? "نشانی تصویری که در فضای ذخیره‌سازی PET LIFE بارگذاری شده است (https://…). تصاویر از منابع ناشناس پذیرفته نمی‌شوند." : "The address of an image uploaded to PET LIFE storage (https://…). Images from arbitrary sources are not accepted."}</p>
        <Input label={fa ? "نشانی تصویر" : "Image URL"} dir="ltr" value={url} onChange={(e) => setUrl(e.target.value.trim())} errorMessage={url && !valid ? (fa ? "نشانی معتبر نیست" : "Not a valid address") : undefined} />
        <Input dir="auto" label={fa ? "توضیح تصویر (برای دسترس‌پذیری)" : "Alt text (for accessibility)"} value={alt} maxLength={200} onChange={(e) => setAlt(e.target.value)} />
        <Button isLoading={busy} disabled={!valid} onClick={() => void save(async () => { const r = await travelProviderService.addMedia(listing.id, { url, alt: alt.trim() || undefined }); setUrl(""); setAlt(""); return r; })}>{fa ? "افزودن تصویر" : "Add photo"}</Button>
      </ContextSurface>
    </div>
  );
}

function CalendarTab({ listing, busy, save }: { listing: TravelListingDto; busy: boolean; save: SaveFn }) {
  const { lang, fa } = useLang();
  const [from, setFrom] = useState(todayIso());
  const [cal, setCal] = useState<TravelProviderCalendarDto[] | null>(null);
  const [unitId, setUnitId] = useState(listing.units[0]?.id ?? "");
  const [range, setRange] = useState<DateRangeValue>({ start: null, end: null });
  const [price, setPrice] = useState("");
  const load = useCallback(() => {
    setCal(null);
    travelProviderService.calendar(listing.id, from, addDays(from, 27)).then(setCal).catch(() => setCal([]));
  }, [listing.id, from]);
  useEffect(load, [load]);
  const unitCal = cal?.find((c) => c.unitId === unitId);
  const apply = (isBlocked: boolean) => {
    if (!range.start) return;
    const toDate = range.end ? addDays(range.end, -1) : range.start;
    void save(async () => { const r = await travelProviderService.setAvailability(listing.id, unitId, { fromDate: range.start!, toDate, isBlocked, priceIrr: !isBlocked && price ? Number(price) * 10 : undefined }); load(); return r; }, fa ? "تقویم به‌روز شد." : "Calendar updated.");
  };
  if (!listing.units.length) return <p className="text-sm text-text-secondary">{fa ? "ابتدا یک اتاق اضافه کنید." : "Add a room first."}</p>;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">{fa ? "اتاق" : "Room"}
          <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="min-h-11 rounded-md border border-border-subtle bg-surface-base px-2">{listing.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        </label>
        <Button size="sm" variant="secondary" onClick={() => setFrom(addDays(from, -28))} disabled={from <= todayIso()}>{fa ? "۴ هفته قبل" : "Previous 4 weeks"}</Button>
        <Button size="sm" variant="secondary" onClick={() => setFrom(addDays(from, 28))}>{fa ? "۴ هفته بعد" : "Next 4 weeks"}</Button>
      </div>
      {cal === null ? <Skeleton className="h-48" /> : !unitCal ? <p className="text-sm text-text-secondary">{fa ? "تقویم بارگیری نشد." : "Calendar could not be loaded."}</p> : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" aria-label={fa ? "روزها" : "Days"}>
          {unitCal.days.map((d) => (
            <li key={d.date} className={`flex flex-col gap-0.5 rounded-md border p-2 text-metadata ${d.isBlocked ? "border-state-higher-concern/40 bg-state-higher-concern/10" : d.remaining === 0 ? "border-state-attention/40 bg-state-attention/10" : "border-border-subtle"}`}>
              <span className="font-bold text-text-primary">{formatDay(d.date, lang, { weekday: true, year: false })}</span>
              <span>{d.isBlocked ? (fa ? "مسدود" : "Blocked") : fa ? `${localizeDigits(d.remaining, "fa")} از ${localizeDigits(unitCal.quantity, "fa")} آزاد` : `${d.remaining} of ${unitCal.quantity} free`}</span>
              <span className="tabular-nums">{money(d.priceIrr, lang)}</span>
              {d.bookings.map((b) => <Link key={b.id} href={`/${lang}/provider/travel/bookings/${b.id}`} className="truncate underline">{b.reference}</Link>)}
            </li>
          ))}
        </ul>
      )}
      <ContextSurface className="flex flex-col gap-3">
        <h3 className="font-bold">{fa ? "مسدود کردن یا قیمت‌گذاری بازه" : "Block or price a range"}</h3>
        <DateRangeField label={fa ? "بازهٔ شب‌ها" : "Nights"} value={range} onChange={setRange} min={todayIso()} max={addDays(todayIso(), 365)} maxNights={366} />
        <Input label={fa ? "قیمت ویژهٔ هر شب (تومان) — خالی یعنی قیمت پایه" : "Special nightly price (Toman) — blank uses the base price"} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="danger" disabled={!range.start || busy} onClick={() => apply(true)}>{fa ? "مسدود کن" : "Block"}</Button>
          <Button size="sm" disabled={!range.start || busy} onClick={() => apply(false)}>{price ? (fa ? "اعمال قیمت و باز کردن" : "Open with this price") : fa ? "باز کردن (قیمت پایه)" : "Open at base price"}</Button>
        </div>
        <p className="text-metadata text-text-secondary">{fa ? "مسدود کردن روی رزروهای موجود اثر ندارد؛ فقط رزرو تازه را متوقف می‌کند." : "Blocking does not affect existing bookings; it only stops new ones."}</p>
      </ContextSurface>
    </div>
  );
}

const BOOKING_FILTERS = ["", "AWAITING_PROVIDER", "AWAITING_PAYMENT", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

export function ProviderTravelBookingsView() {
  const { lang, fa } = useLang();
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<TravelBookingDto[] | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(() => {
    setRows(null);
    setError(false);
    travelProviderService.bookings({ status: status || undefined }).then((r) => setRows(r.items)).catch(() => setError(true));
  }, [status]);
  useEffect(load, [load]);
  return (
    <div className="flex flex-col gap-5">
      <ProviderTravelNav />
      <h1 className="text-page-title">{fa ? "رزروهای اقامت" : "Stay bookings"}</h1>
      <div className="flex gap-2 overflow-x-auto" role="group" aria-label={fa ? "فیلتر وضعیت" : "Status filter"}>
        {BOOKING_FILTERS.map((s) => <button key={s || "all"} aria-pressed={status === s} onClick={() => setStatus(s)} className={`min-h-10 shrink-0 rounded-full border px-3 text-sm ${status === s ? "border-brand-natural bg-brand-natural/10" : "border-border-subtle text-text-secondary"}`}>{s ? bookingStatusLabel(s, lang) : fa ? "همه" : "All"}</button>)}
      </div>
      {error ? <ErrorRecovery title={fa ? "بارگیری نشد" : "Could not load"} message={fa ? "دوباره تلاش کنید." : "Please try again."} retryLabel={fa ? "تلاش دوباره" : "Try again"} onRetry={load} /> : rows === null ? <Skeleton className="h-40" /> : rows.length === 0 ? <EmptyState title={fa ? "رزروی نیست" : "No bookings"} /> : (
        <ul className="flex flex-col gap-2">
          {rows.map((b) => (
            <li key={b.id}>
              <Link href={`/${lang}/provider/travel/bookings/${b.id}`} className="flex flex-col gap-1 rounded-md border border-border-subtle bg-surface-elevated p-3 hover:border-border-strong">
                <span className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold">{b.reference} · {b.listingTitle}</span><StatusLabel tone={bookingStatusTone(b.status)}>{bookingStatusLabel(b.status, lang)}</StatusLabel></span>
                <span className="text-sm text-text-secondary">{b.unitName} · {stayDates(b, lang)} · {b.pets.map((p) => p.petName).join("، ") || (fa ? "بدون حیوان" : "no pets")}</span>
                {b.status === "AWAITING_PROVIDER" && b.requestExpiresAt ? <span className="text-metadata text-state-attention">{fa ? `پاسخ تا ${formatDay(b.requestExpiresAt.slice(0, 10), lang)}` : `Respond by ${formatDay(b.requestExpiresAt.slice(0, 10), lang)}`}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Booking detail for the host: minimum pet data (names, species) plus only documents the guest chose to share. */
export function ProviderTravelBookingDetailView({ bookingId }: { bookingId: string }) {
  const { lang, fa } = useLang();
  const [b, setB] = useState<TravelBookingDto | null>(null);
  const [load, setLoad] = useState<"loading" | "ready" | "notFound" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [reason, setReason] = useState("");
  const fetchB = useCallback(async () => {
    try {
      setB(await travelProviderService.booking(bookingId));
      setLoad("ready");
    } catch (e) {
      setLoad(e instanceof ApiError && e.status === 404 ? "notFound" : "error");
    }
  }, [bookingId]);
  useEffect(() => void fetchB(), [fetchB]);
  const act = async (fn: () => Promise<TravelBookingDto>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      setB(await fn());
      setMsg({ ok: true, text: ok });
      setReason("");
    } catch (e) {
      setMsg({ ok: false, text: errorText(e, fa) });
    } finally {
      setBusy(false);
    }
  };
  const openDoc = async (shareId: string) => {
    try {
      const t = await travelProviderService.documentUrl(bookingId, shareId);
      window.open(t.downloadUrl, "_blank", "noopener,noreferrer");
    } catch {
      setMsg({ ok: false, text: fa ? "دسترسی به این مدرک دیگر فعال نیست." : "Access to this document is no longer active." });
    }
  };
  if (load === "loading") return <Skeleton className="h-64" />;
  if (load === "notFound") return <EmptyState title={fa ? "رزرو پیدا نشد" : "Booking not found"} />;
  if (load === "error" || !b) return <ErrorRecovery title={fa ? "بارگیری نشد" : "Could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Try again"} onRetry={() => void fetchB()} />;
  const today = todayIso();
  const checkIn = b.checkIn.slice(0, 10);
  return (
    <div className="flex flex-col gap-5">
      <ProviderTravelNav />
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2"><StatusLabel tone={bookingStatusTone(b.status)}>{bookingStatusLabel(b.status, lang)}</StatusLabel><span className="text-metadata text-text-secondary">{paymentStatusLabel(b.paymentStatus, lang)}</span></div>
        <h1 className="text-page-title">{b.reference}</h1>
        <p>{b.listingTitle} · {b.unitName}{b.ratePlan ? ` · ${b.ratePlan.name}` : ""}</p>
        <p className="text-sm text-text-secondary">{stayDates(b, lang)} · {fa ? `${localizeDigits(b.guests, "fa")} مهمان` : `${b.guests} guest${b.guests === 1 ? "" : "s"}`}</p>
      </header>
      {msg ? <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-state-success" : "text-state-urgent"}`}>{msg.text}</p> : null}
      <ContextSurface className="flex flex-col gap-2 text-sm">
        <p><span className="font-bold">{fa ? "حیوانات: " : "Pets: "}</span>{b.pets.map((p) => `${p.petName} (${p.petSpecies === "DOG" ? (fa ? "سگ" : "dog") : p.petSpecies === "CAT" ? (fa ? "گربه" : "cat") : fa ? "سایر" : "other"})`).join("، ") || (fa ? "ندارد" : "none")}</p>
        {b.travelerNote ? <p><span className="font-bold">{fa ? "پیام مهمان: " : "Guest message: "}</span>{b.travelerNote}</p> : null}
        <p><span className="font-bold">{fa ? "مبلغ کل: " : "Total: "}</span>{money(b.totalAmountIrr, lang)} · {fa ? "آنلاین: " : "online: "}{money(b.payNowAmountIrr, lang)}{b.priceBreakdown?.payLaterIrr ? ` · ${fa ? "در محل: " : "at property: "}${money(b.priceBreakdown.payLaterIrr, lang)}` : ""}</p>
        <p><span className="font-bold">{fa ? "شرایط لغو: " : "Cancellation: "}</span>{b.ratePlan ? cancellationSummary(b.ratePlan, lang) : b.cancellationPolicySnapshot ?? "—"}</p>
      </ContextSurface>
      <section className="flex flex-col gap-2">
        <h2 className="text-section-title">{fa ? "مدارک به‌اشتراک‌گذاشته‌شده توسط مهمان" : "Documents the guest shared"}</h2>
        {b.documentShares.filter((s) => s.isActive).length === 0 ? <p className="text-sm text-text-secondary">{fa ? "مدرکی به اشتراک گذاشته نشده است. در صورت نیاز از مهمان بخواهید از صفحهٔ رزرو خود مدرک را به اشتراک بگذارد." : "No documents shared. If you need one, ask the guest to share it from their booking page."}</p> : b.documentShares.filter((s) => s.isActive).map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle p-3 text-sm"><span>{s.title} · {fa ? "تا " : "until "}{formatDay(s.expiresAt.slice(0, 10), lang)}</span><Button size="sm" variant="secondary" onClick={() => void openDoc(s.id)}>{fa ? "مشاهدهٔ امن" : "View securely"}</Button></div>
        ))}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-section-title">{fa ? "اقدامات" : "Actions"}</h2>
        {b.status === "AWAITING_PROVIDER" ? (
          <>
            <Button isLoading={busy} onClick={() => void act(() => travelProviderService.accept(b.id), fa ? "پذیرفته شد؛ مهمان ۲۴ ساعت برای پرداخت فرصت دارد." : "Accepted; the guest has 24 hours to pay.")}>{fa ? "پذیرش درخواست" : "Accept request"}</Button>
            <Input label={fa ? "علت رد (به مهمان نمایش داده می‌شود)" : "Reason for declining (shown to the guest)"} value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button variant="danger" disabled={reason.trim().length < 3} isLoading={busy} onClick={() => void act(() => travelProviderService.reject(b.id, reason.trim()), fa ? "رد شد و تاریخ‌ها آزاد شدند." : "Declined; the dates were released.")}>{fa ? "رد درخواست" : "Decline"}</Button>
          </>
        ) : null}
        {b.status === "CONFIRMED" && today >= checkIn ? <Button isLoading={busy} onClick={() => void act(() => travelProviderService.checkIn(b.id), fa ? "ورود ثبت شد." : "Checked in.")}>{fa ? "ثبت ورود مهمان" : "Check in guest"}</Button> : null}
        {b.status === "CONFIRMED" && today > checkIn ? <Button variant="secondary" isLoading={busy} onClick={() => void act(() => travelProviderService.noShow(b.id), fa ? "عدم حضور ثبت شد." : "No-show recorded.")}>{fa ? "ثبت عدم حضور" : "Record no-show"}</Button> : null}
        {b.status === "IN_PROGRESS" ? <Button isLoading={busy} onClick={() => void act(() => travelProviderService.complete(b.id), fa ? "اقامت پایان یافت؛ مهمان می‌تواند نظر بدهد." : "Stay completed; the guest can now review.")}>{fa ? "پایان اقامت" : "Complete stay"}</Button> : null}
        {["AWAITING_PAYMENT", "CONFIRMED"].includes(b.status) ? (
          <details className="rounded-md border border-border-subtle p-3">
            <summary className="cursor-pointer text-sm">{fa ? "لغو از طرف اقامتگاه" : "Cancel as the property"}</summary>
            <p className="my-2 text-sm text-text-secondary">{fa ? "لغو از طرف اقامتگاه یعنی بازپرداخت کامل مبلغ آنلاین به مهمان." : "A cancellation by the property refunds the guest's full online payment."}</p>
            <Input label={fa ? "علت (به مهمان نمایش داده می‌شود)" : "Reason (shown to the guest)"} value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button className="mt-2" variant="danger" disabled={reason.trim().length < 3} isLoading={busy} onClick={() => void act(() => travelProviderService.cancel(b.id, reason.trim()), fa ? "لغو شد." : "Cancelled.")}>{fa ? "لغو رزرو" : "Cancel booking"}</Button>
          </details>
        ) : null}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-section-title">{fa ? "تاریخچه" : "Timeline"}</h2>
        <ol className="flex flex-col gap-1 border-s border-border-subtle ps-4 text-sm">{b.timeline.map((e, i) => <li key={i}>{bookingStatusLabel(e.toStatus, lang)} <span className="text-text-secondary">· {new Intl.DateTimeFormat(fa ? "fa-IR-u-ca-persian" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(e.createdAt))}</span></li>)}</ol>
      </section>
    </div>
  );
}

export function ProviderTravelReviewsView() {
  const { lang, fa } = useLang();
  const [rows, setRows] = useState<ProviderTravelReviewRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => {
    travelProviderService.reviews().then((r) => setRows(r.items)).catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);
  return (
    <div className="flex flex-col gap-5">
      <ProviderTravelNav />
      <h1 className="text-page-title">{fa ? "نظرات مهمانان" : "Guest reviews"}</h1>
      <p className="text-sm text-text-secondary">{fa ? "هر نظر فقط یک پاسخ عمومی می‌پذیرد. نظرها را نمی‌توان ویرایش یا پنهان کرد؛ در صورت تخلف به پشتیبانی گزارش دهید." : "Each review accepts one public response. Reviews cannot be edited or hidden by you; report abuse to support."}</p>
      {msg ? <p role="alert" className="text-sm text-state-urgent">{msg}</p> : null}
      {rows === null ? <Skeleton className="h-40" /> : rows.length === 0 ? <EmptyState title={fa ? "هنوز نظری ثبت نشده" : "No reviews yet"} /> : (
        <ul className="flex flex-col gap-3">{rows.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 rounded-md border border-border-subtle p-3 text-sm">
            <p><span className="font-bold">{r.listingTitle}</span> · {"★".repeat(r.overall)}{"☆".repeat(5 - r.overall)} · {formatDay(r.createdAt.slice(0, 10), lang)}{r.status === "HIDDEN" ? (fa ? " · پنهان‌شده توسط PET LIFE" : " · hidden by PET LIFE") : ""}</p>
            {r.body ? <p>{r.body}</p> : null}
            {r.providerResponse ? <p className="rounded-md bg-surface-subtle p-2"><span className="font-bold">{fa ? "پاسخ شما: " : "Your response: "}</span>{r.providerResponse}</p> : (
              <div className="flex flex-col gap-2">
                <textarea dir="auto" aria-label={fa ? "پاسخ" : "Response"} maxLength={1000} value={drafts[r.id] ?? ""} onChange={(e) => setDrafts({ ...drafts, [r.id]: e.target.value })} className="min-h-16 rounded-md border border-border-subtle bg-surface-base p-2" />
                <Button size="sm" className="w-fit" disabled={(drafts[r.id] ?? "").trim().length < 3} onClick={() => void travelProviderService.respond(r.id, drafts[r.id]!.trim()).then(load).catch(() => setMsg(fa ? "پاسخ ثبت نشد." : "Response not saved."))}>{fa ? "انتشار پاسخ" : "Publish response"}</Button>
              </div>
            )}
          </li>
        ))}</ul>
      )}
    </div>
  );
}

export function ProviderTravelFinanceView() {
  const { lang, fa } = useLang();
  const [range, setRange] = useState<DateRangeValue>({ start: addDays(todayIso(), -30), end: todayIso() });
  const [data, setData] = useState<TravelProviderFinanceDto | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(() => {
    setData(null);
    setError(false);
    travelProviderService.finance(range.start ?? undefined, range.end ?? undefined).then(setData).catch(() => setError(true));
  }, [range]);
  useEffect(load, [load]);
  const kpis = useMemo(() => (data ? [[fa ? "ارزش رزروها" : "Booked value", data.bookedValueIrr], [fa ? "دریافت آنلاین" : "Collected online", data.paidOnlineIrr], [fa ? "بازپرداخت‌ها" : "Refunded", data.refundedIrr], [fa ? "خالص آنلاین" : "Net online", data.netCollectedIrr], [fa ? "پرداخت در محل (اعلامی)" : "Pay at property (stated)", data.payAtPropertyIrr]] as [string, number][] : []), [data, fa]);
  return (
    <div className="flex flex-col gap-5">
      <ProviderTravelNav />
      <h1 className="text-page-title">{fa ? "گزارش مالی اقامت" : "Stay finance"}</h1>
      <DateRangeField label={fa ? "بازه (بر اساس تاریخ ورود)" : "Range (by check-in)"} value={range} onChange={setRange} min="2020-01-01" max={addDays(todayIso(), 365)} maxNights={366} />
      <p className="rounded-md bg-surface-subtle p-3 text-sm">{fa ? "تسویه با اقامتگاه‌ها هنوز خودکار نیست؛ این صفحه فقط ارقام واقعی رزرو، دریافت و بازپرداخت را نشان می‌دهد و هیچ مبلغ تسویه‌ای را برآورد نمی‌کند." : "Payouts to properties are not automated yet; this page shows only real booked, collected and refunded figures and does not estimate any payout."}</p>
      {error ? <ErrorRecovery title={fa ? "بارگیری نشد" : "Could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Try again"} onRetry={load} /> : data === null ? <Skeleton className="h-40" /> : (
        <>
          <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">{kpis.map(([label, v]) => <div key={label} className="rounded-md border border-border-subtle p-3"><dt className="text-metadata text-text-secondary">{label}</dt><dd className="font-bold tabular-nums">{money(v, lang)}</dd></div>)}</dl>
          {data.rows.length === 0 ? <p className="text-sm text-text-secondary">{fa ? "رزروی در این بازه نیست." : "No bookings in this range."}</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr className="text-text-secondary"><th className="p-2 text-start">{fa ? "کد" : "Ref"}</th><th className="p-2 text-start">{fa ? "ورود" : "Check-in"}</th><th className="p-2 text-start">{fa ? "وضعیت" : "Status"}</th><th className="p-2 text-end">{fa ? "مبلغ" : "Total"}</th><th className="p-2 text-end">{fa ? "دریافت" : "Paid"}</th><th className="p-2 text-end">{fa ? "بازپرداخت" : "Refunded"}</th></tr></thead>
                <tbody>{data.rows.map((r) => <tr key={r.bookingId} className="border-t border-border-subtle"><td className="p-2"><Link className="underline" href={`/${lang}/provider/travel/bookings/${r.bookingId}`}>{r.reference}</Link></td><td className="p-2">{formatDay(r.checkIn.slice(0, 10), lang)}</td><td className="p-2">{bookingStatusLabel(r.status, lang)}</td><td className="p-2 text-end tabular-nums">{money(r.totalIrr, lang)}</td><td className="p-2 text-end tabular-nums">{money(r.paidIrr, lang)}</td><td className="p-2 text-end tabular-nums">{money(r.refundedIrr, lang)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
