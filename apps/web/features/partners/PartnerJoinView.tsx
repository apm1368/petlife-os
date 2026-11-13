"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, ErrorRecovery, Input, Select, Skeleton } from "@petlife/ui";
import type { SellerCatalogDirectoryItemDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { buildLoginUrl } from "@/lib/auth/return-to";
import { IRAN_PROVINCES } from "@/lib/geo/iran-provinces";
import { LocationPicker } from "@/features/maps/LocationPicker";
import type { MapPoint } from "@/features/maps/MapView";
import { useSessionStore } from "@/stores/session-store";
import { sellerOsService } from "@/services/seller-os.service";
import {
  PARTNER_SERVICE_KINDS,
  partnerOnboardingService,
  putToTarget,
  type DayHours,
  type PartnerOnboardingStateDto,
  type PartnerServiceKind,
  type PartnerSubject,
} from "@/services/partner-onboarding.service";

/** Persian week order: Saturday first (JS dayOfWeek: 6, 0, 1 … 5). */
const WEEK = [6, 0, 1, 2, 3, 4, 5];
const DOC_KINDS = ["NATIONAL_ID_CARD", "BUSINESS_LICENSE", "LICENSE", "ENAMAD"] as const;
const DOC_MIME = ["image/jpeg", "image/png", "application/pdf"];
const LOGO_MIME = ["image/jpeg", "image/png", "image/webp"];
const toToman = (irr: number) => String(Math.round(irr / 10));
const toIrr = (toman: string) => {
  const n = Number(toman.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[,\s٬]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) * 10 : 0;
};
const num = (v: string) => Number(v.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)));

type StepKey = "kinds" | "business" | "owner" | "documents" | "address" | "calendar" | "services" | "hours" | "products" | "review";

/** /[locale]/partners/join — "ثبت‌نام همکار": the introduction when signed out, the signup wizard when signed in. */
export function PartnerJoinView() {
  const session = useSessionStore((s) => s.status);
  const [state, setState] = useState<PartnerOnboardingStateDto | null>(null);
  const [failed, setFailed] = useState(false);
  const t = useTranslations("partnerOnboarding");

  async function load() {
    setFailed(false);
    try {
      setState(await partnerOnboardingService.state());
    } catch {
      setFailed(true);
    }
  }
  useEffect(() => {
    if (session === "authenticated") void load();
  }, [session]);

  if (session === "idle" || session === "loading") return <Skeleton className="h-64 w-full" />;
  if (session !== "authenticated") return <PartnerJoinIntro />;
  if (failed) return <ErrorRecovery title={t("loadFailed")} message="" retryLabel={t("retry")} onRetry={() => void load()} />;
  if (!state) return <Skeleton className="h-64 w-full" />;
  if (state.submitted) return <PartnerSubmitted state={state} />;
  return <PartnerWizard state={state} onState={setState} />;
}

function PartnerJoinIntro() {
  const t = useTranslations("partnerOnboarding");
  const locale = useLocale();
  const back = `/${locale}/partners/join`;
  return (
    <div className="flex flex-col gap-5">
      <header className="section-head">
        <div>
          <h1>{t("intro.title")}</h1>
          <p>{t("intro.body")}</p>
        </div>
      </header>
      <ul className="list-disc ps-5 text-body text-text-secondary">
        {(["kinds", "documents", "address", "services", "shop", "review"] as const).map((k) => (
          <li key={k}>{t(`intro.needs.${k}`)}</li>
        ))}
      </ul>
      <p className="calm-note text-body">{t("intro.reviewNote")}</p>
      <div className="flex flex-wrap gap-3">
        <Link className="opl-btn primary" href={`/${locale}/register?returnTo=${encodeURIComponent(back)}`}>{t("intro.create")}</Link>
        <Link className="opl-btn" href={buildLoginUrl(locale, back)}>{t("intro.signIn")}</Link>
      </div>
    </div>
  );
}

function PartnerSubmitted({ state }: { state: PartnerOnboardingStateDto }) {
  const t = useTranslations("partnerOnboarding");
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title">{state.verified ? t("submitted.verifiedTitle") : t("submitted.title")}</h1>
      <p className="calm-note text-body">{state.verified ? t("submitted.verifiedBody") : t("submitted.body")}</p>
      <ul className="flex flex-col gap-1 text-sm">
        {state.verification.map((v) => (
          <li key={v.subject}>{t(`subject.${v.subject}`)}: {t.has(`lifecycle.${v.lifecycle}`) ? t(`lifecycle.${v.lifecycle}` as "lifecycle.PENDING") : v.lifecycle}</li>
        ))}
      </ul>
      <Link className="opl-btn primary w-fit" href={`/${locale}/business`}>{t("submitted.toBusiness")}</Link>
    </div>
  );
}

function PartnerWizard({ state, onState }: { state: PartnerOnboardingStateDto; onState: (s: PartnerOnboardingStateDto) => void }) {
  const t = useTranslations("partnerOnboarding");
  const steps = useMemo<StepKey[]>(() => {
    if (!state.started) return ["kinds"];
    return ["kinds", "business", "owner", "documents", "address", ...(state.serviceKinds.length ? (["calendar", "services"] as StepKey[]) : []), ...(state.shop ? (["hours", "products"] as StepKey[]) : []), "review"];
  }, [state.started, state.serviceKinds.length, state.shop]);
  const [step, setStep] = useState<StepKey>(state.started ? "business" : "kinds");
  const index = Math.max(0, steps.indexOf(step));
  const next = (s: PartnerOnboardingStateDto) => {
    onState(s);
    const order: StepKey[] = s.started ? ["kinds", "business", "owner", "documents", "address", ...(s.serviceKinds.length ? (["calendar", "services"] as StepKey[]) : []), ...(s.shop ? (["hours", "products"] as StepKey[]) : []), "review"] : ["kinds"];
    const at = order.indexOf(step);
    setStep(order[Math.min(order.length - 1, at + 1)] ?? "review");
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="section-head">
        <div>
          <h1>{t("wizard.title")}</h1>
          <p>{t("wizard.reviewNote")}</p>
        </div>
      </header>
      <nav aria-label={t("wizard.steps")} className="flex flex-wrap gap-2">
        {steps.map((s, i) => (
          <button key={s} type="button" className={`tag ${s === step ? "is-active" : ""}`} aria-current={s === step ? "step" : undefined} onClick={() => setStep(s)}>
            {i + 1}. {t(`steps.${s}`)}
          </button>
        ))}
      </nav>
      <section className="split-panel flex flex-col gap-4" aria-labelledby="partner-step-title">
        <h2 id="partner-step-title" className="text-section-title">{t(`steps.${steps[index]!}`)}</h2>
        {step === "kinds" ? <KindsStep state={state} onSaved={next} /> : null}
        {step === "business" ? <BusinessStep state={state} onSaved={next} /> : null}
        {step === "owner" ? <OwnerStep state={state} onSaved={next} /> : null}
        {step === "documents" ? <DocumentsStep state={state} onSaved={onState} onNext={() => next(state)} /> : null}
        {step === "address" ? <AddressStep state={state} onSaved={next} /> : null}
        {step === "calendar" ? <HoursStep initial={state.calendar} onSave={(d) => partnerOnboardingService.calendar(d)} onSaved={next} /> : null}
        {step === "services" ? <ServicesStep state={state} onSaved={next} /> : null}
        {step === "hours" ? <HoursStep initial={state.openingHours.map((h) => ({ dayOfWeek: h.dayOfWeek, start: h.open, end: h.close }))} onSave={(d) => partnerOnboardingService.openingHours(d)} onSaved={next} /> : null}
        {step === "products" ? <ProductsStep state={state} onSaved={next} /> : null}
        {step === "review" ? <ReviewStep state={state} onSubmitted={onState} /> : null}
      </section>
    </div>
  );
}

/** Shared save handling: runs the call, maps the API's reason to copy, hands the new state up. */
function useSave() {
  const t = useTranslations("partnerOnboarding");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<PartnerOnboardingStateDto>, done: (s: PartnerOnboardingStateDto) => void) {
    setBusy(true);
    setError(null);
    try {
      done(await fn());
    } catch (e) {
      const reason = e instanceof ApiError ? String(e.details?.reason ?? e.code) : "";
      setError(t.has(`errors.${reason}`) ? t(`errors.${reason}` as "errors.generic") : t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }
  const alert = error ? <p role="alert" className="text-sm text-state-urgent">{error}</p> : null;
  return { busy, run, alert, setError };
}

function KindsStep({ state, onSaved }: { state: PartnerOnboardingStateDto; onSaved: (s: PartnerOnboardingStateDto) => void }) {
  const t = useTranslations("partnerOnboarding");
  const [kinds, setKinds] = useState<PartnerServiceKind[]>(state.serviceKinds);
  const [shop, setShop] = useState(state.shop);
  const [name, setName] = useState(state.business?.name ?? "");
  const { busy, run, alert, setError } = useSave();
  const toggle = (k: PartnerServiceKind) => setKinds((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!kinds.length && !shop) return setError(t("errors.PICK_AT_LEAST_ONE"));
        if (name.trim().length < 2) return setError(t("errors.NAME_REQUIRED"));
        void run(() => partnerOnboardingService.start({ serviceKinds: kinds, shop, businessName: name.trim() }), onSaved);
      }}
    >
      <p className="text-body text-text-secondary">{t("kinds.hint")}</p>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-bold">{t("kinds.services")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {PARTNER_SERVICE_KINDS.map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={kinds.includes(k)} onChange={() => toggle(k)} />
              {t(`kind.${k}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-bold">{t("kinds.shopTitle")}</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={shop} disabled={state.shop} onChange={(e) => setShop(e.target.checked)} />
          {t("kind.SHOP")}
        </label>
      </fieldset>
      <Input label={t("business.name")} value={name} onChange={(e) => setName(e.target.value)} />
      {alert}
      <Button type="submit" isLoading={busy} className="w-fit">{t("saveAndContinue")}</Button>
    </form>
  );
}

function BusinessStep({ state, onSaved }: { state: PartnerOnboardingStateDto; onSaved: (s: PartnerOnboardingStateDto) => void }) {
  const t = useTranslations("partnerOnboarding");
  const [name, setName] = useState(state.business?.name ?? "");
  const [description, setDescription] = useState(state.business?.description ?? "");
  const [logo, setLogo] = useState<File | null>(null);
  const { busy, run, alert, setError } = useSave();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (logo && (!LOGO_MIME.includes(logo.type) || logo.size > 10 * 1024 * 1024)) return setError(t("errors.LOGO_FILE"));
        void run(async () => {
          let logoObjectKey: string | undefined;
          if (logo) {
            const target = await partnerOnboardingService.logoUpload(logo.type, logo.size);
            await putToTarget(target, logo);
            logoObjectKey = target.key;
          }
          return partnerOnboardingService.business({ name: name.trim(), description: description.trim() || undefined, logoObjectKey });
        }, onSaved);
      }}
    >
      <Input label={t("business.name")} value={name} onChange={(e) => setName(e.target.value)} />
      <label className="flex flex-col gap-1 text-sm">
        {t("business.description")}
        <textarea dir="auto" rows={4} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} className="rounded-md border border-border-subtle bg-surface-base p-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("business.logo")}
        <input type="file" accept={LOGO_MIME.join(",")} onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
        <span className="text-metadata text-text-secondary">{t("business.logoHint")}</span>
      </label>
      {state.business?.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={state.business.logoUrl} alt="" className="h-16 w-16 rounded-md object-cover" />
      ) : null}
      {alert}
      <Button type="submit" isLoading={busy} className="w-fit">{t("saveAndContinue")}</Button>
    </form>
  );
}

function OwnerStep({ state, onSaved }: { state: PartnerOnboardingStateDto; onSaved: (s: PartnerOnboardingStateDto) => void }) {
  const t = useTranslations("partnerOnboarding");
  const locale = useLocale();
  const [firstName, setFirstName] = useState(state.owner?.firstName ?? "");
  const [lastName, setLastName] = useState(state.owner?.lastName ?? "");
  const [phone, setPhone] = useState(state.owner?.phone ?? "");
  const { busy, run, alert } = useSave();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => partnerOnboardingService.owner({ firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim() }), onSaved);
      }}
    >
      {!state.mobileVerified ? (
        <p className="calm-note text-body">
          {t("owner.verifyMobile")} <Link className="underline" href={`/${locale}/profile/security`}>{t("owner.verifyMobileLink")}</Link>
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label={t("owner.firstName")} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        <Input label={t("owner.lastName")} value={lastName} onChange={(e) => setLastName(e.target.value)} />
      </div>
      <Input label={t("owner.phone")} dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      {alert}
      <Button type="submit" isLoading={busy} className="w-fit">{t("saveAndContinue")}</Button>
    </form>
  );
}

function DocumentsStep({ state, onSaved, onNext }: { state: PartnerOnboardingStateDto; onSaved: (s: PartnerOnboardingStateDto) => void; onNext: () => void }) {
  const t = useTranslations("partnerOnboarding");
  const [kind, setKind] = useState<(typeof DOC_KINDS)[number]>("NATIONAL_ID_CARD");
  const [file, setFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const { busy, run, alert, setError } = useSave();
  const subjects: PartnerSubject[] = [...(state.serviceKinds.length ? (["PROVIDER"] as PartnerSubject[]) : []), ...(state.shop ? (["SELLER"] as PartnerSubject[]) : [])];
  // One upload covers the whole signup: the same file is stored privately for each business that needs it.
  const docs = state.verification[0]?.documents ?? [];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-text-secondary">{t("documents.hint")}</p>
      <ul className="flex flex-col gap-1 text-sm">
        {docs.length === 0 ? <li className="text-text-secondary">{t("documents.none")}</li> : null}
        {docs.map((d) => (
          <li key={d.id}>
            {t.has(`docKind.${d.kind}`) ? t(`docKind.${d.kind}` as "docKind.LICENSE") : d.kind} · {t.has(`docStatus.${d.status}`) ? t(`docStatus.${d.status}` as "docStatus.PENDING") : d.status}
          </li>
        ))}
      </ul>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!file) return;
          if (!DOC_MIME.includes(file.type) || file.size <= 0 || file.size > 20 * 1024 * 1024) return setError(t("errors.DOC_FILE"));
          void run(async () => {
            let latest: PartnerOnboardingStateDto | null = null;
            for (const subject of subjects) {
              const target = await partnerOnboardingService.documentUpload(subject, file.type, file.size);
              await putToTarget(target, file);
              latest = await partnerOnboardingService.registerDocument({ subject, objectKey: target.key, kind, contentType: file.type, fileSizeBytes: file.size });
            }
            return latest ?? partnerOnboardingService.state();
          }, (s) => {
            onSaved(s);
            setFile(null);
            if (input.current) input.current.value = "";
          });
        }}
      >
        <Select label={t("documents.kind")} value={kind} onChange={(e) => setKind(e.target.value as (typeof DOC_KINDS)[number])} options={DOC_KINDS.map((k) => ({ value: k, label: t(`docKind.${k}`) }))} />
        <label className="flex flex-col gap-1 text-sm">
          {t("documents.file")}
          <input ref={input} type="file" accept={DOC_MIME.join(",")} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <span className="text-metadata text-text-secondary">{t("documents.private")}</span>
        </label>
        {alert}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="secondary" isLoading={busy} disabled={!file}>{t("documents.upload")}</Button>
          <Button type="button" onClick={onNext} disabled={!docs.some((d) => d.kind === "NATIONAL_ID_CARD")}>{t("continue")}</Button>
        </div>
      </form>
    </div>
  );
}

function AddressStep({ state, onSaved }: { state: PartnerOnboardingStateDto; onSaved: (s: PartnerOnboardingStateDto) => void }) {
  const t = useTranslations("partnerOnboarding");
  const [province, setProvince] = useState(state.address?.province ?? "");
  const cities = IRAN_PROVINCES.find((p) => p.name === province)?.cities ?? [];
  const [city, setCity] = useState(state.address?.city ?? "");
  const [otherCity, setOtherCity] = useState(!!state.address?.city && !cities.includes(state.address.city));
  const [addressLine, setAddressLine] = useState(state.address?.addressLine ?? "");
  const [postalCode, setPostalCode] = useState(state.address?.postalCode ?? "");
  const savedPin = state.address?.latitude != null && state.address.longitude != null ? { latitude: state.address.latitude, longitude: state.address.longitude } : null;
  const [pin, setPin] = useState<MapPoint | null>(savedPin);
  const [consent, setConsent] = useState(savedPin !== null);
  const [exactPublic, setExactPublic] = useState(!!state.address?.exactPinPublic);
  const tp = useTranslations("locationPicker");
  const { busy, run, alert } = useSave();
  // Service businesses choose whether the public sees their exact spot (home-based ones default to ~1 km).
  const offersServices = state.serviceKinds.length > 0;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const pinFields = pin && consent ? { latitude: pin.latitude, longitude: pin.longitude, locationConsent: true } : {};
        void run(() => partnerOnboardingService.address({ province, city: city.trim(), addressLine: addressLine.trim(), postalCode: postalCode.trim() || undefined, ...pinFields, ...(offersServices ? { exactPinPublic: exactPublic } : {}) }), onSaved);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label={t("address.province")} value={province} onChange={(e) => { setProvince(e.target.value); setCity(""); setOtherCity(false); }} options={[{ value: "", label: t("address.pick") }, ...IRAN_PROVINCES.map((p) => ({ value: p.name, label: p.name }))]} />
        {otherCity ? (
          <Input label={t("address.city")} value={city} onChange={(e) => setCity(e.target.value)} />
        ) : (
          <Select label={t("address.city")} value={city} onChange={(e) => { if (e.target.value === "__other") { setOtherCity(true); setCity(""); } else setCity(e.target.value); }} options={[{ value: "", label: t("address.pick") }, ...cities.map((c) => ({ value: c, label: c })), { value: "__other", label: t("address.otherCity") }]} />
        )}
      </div>
      <Input label={t("address.line")} value={addressLine} onChange={(e) => setAddressLine(e.target.value)} />
      <Input label={t("address.postalCode")} dir="ltr" inputMode="numeric" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
      <LocationPicker
        audience="business"
        required={!savedPin}
        value={pin}
        onChange={setPin}
        consent={consent}
        onConsentChange={setConsent}
        {...(offersServices ? { exactPublic, onExactPublicChange: setExactPublic } : {})}
      />
      <p className="text-metadata text-text-secondary">{t("address.pinHint")}</p>
      {pin && !consent ? <p className="text-metadata text-text-secondary">{tp("consentNeeded")}</p> : null}
      {alert}
      <Button type="submit" isLoading={busy} className="w-fit" disabled={!province || !city.trim() || (!savedPin && !pin) || (!!pin && !consent)}>{t("saveAndContinue")}</Button>
    </form>
  );
}

/** Weekly hours: the services' working calendar, or the shop's display-only opening hours. */
function HoursStep({ initial, onSave, onSaved }: { initial: DayHours[]; onSave: (days: DayHours[]) => Promise<PartnerOnboardingStateDto>; onSaved: (s: PartnerOnboardingStateDto) => void }) {
  const t = useTranslations("partnerOnboarding");
  const [rows, setRows] = useState(() => WEEK.map((d) => {
    const found = initial.find((h) => h.dayOfWeek === d);
    return { dayOfWeek: d, on: !!found, start: found?.start ?? "09:00", end: found?.end ?? "18:00" };
  }));
  const { busy, run, alert } = useSave();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => onSave(rows.filter((r) => r.on).map(({ dayOfWeek, start, end }) => ({ dayOfWeek, start, end }))), onSaved);
      }}
    >
      {rows.map((r, i) => (
        <div key={r.dayOfWeek} className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex w-32 items-center gap-2">
            <input type="checkbox" checked={r.on} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
            {t(`day.${r.dayOfWeek}`)}
          </label>
          <input aria-label={t("hours.from", { day: t(`day.${r.dayOfWeek}`) })} type="time" disabled={!r.on} value={r.start} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} className="rounded-md border border-border-subtle bg-surface-base px-2 py-1" />
          <span>–</span>
          <input aria-label={t("hours.to", { day: t(`day.${r.dayOfWeek}`) })} type="time" disabled={!r.on} value={r.end} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} className="rounded-md border border-border-subtle bg-surface-base px-2 py-1" />
        </div>
      ))}
      {alert}
      <Button type="submit" isLoading={busy} className="w-fit" disabled={!rows.some((r) => r.on)}>{t("saveAndContinue")}</Button>
    </form>
  );
}

function ServicesStep({ state, onSaved }: { state: PartnerOnboardingStateDto; onSaved: (s: PartnerOnboardingStateDto) => void }) {
  const t = useTranslations("partnerOnboarding");
  const blank = () => ({ kind: state.serviceKinds[0]!, name: "", price: "", duration: "30", maxPets: "1" });
  const [rows, setRows] = useState(() =>
    state.services.length
      ? state.services.map((s) => ({ kind: (s.kind ?? state.serviceKinds[0]!) as PartnerServiceKind, name: s.name, price: toToman(s.priceIrr), duration: String(s.durationMinutes), maxPets: String(s.maxPets) }))
      : [blank()],
  );
  const { busy, run, alert } = useSave();
  const set = (i: number, patch: Partial<ReturnType<typeof blank>>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => partnerOnboardingService.services(rows.map((r) => ({ kind: r.kind, name: r.name.trim(), priceIrr: toIrr(r.price), durationMinutes: Math.round(num(r.duration)), maxPets: Math.round(num(r.maxPets)) }))), onSaved);
      }}
    >
      <p className="text-body text-text-secondary">{t("services.hint")}</p>
      {rows.map((r, i) => (
        <fieldset key={i} className="grid gap-2 rounded-md border border-border-subtle p-3 sm:grid-cols-5">
          <Select label={t("services.kind")} value={r.kind} onChange={(e) => set(i, { kind: e.target.value as PartnerServiceKind })} options={state.serviceKinds.map((k) => ({ value: k, label: t(`kind.${k}`) }))} />
          <Input label={t("services.name")} value={r.name} onChange={(e) => set(i, { name: e.target.value })} />
          <Input label={t("services.price")} inputMode="numeric" value={r.price} onChange={(e) => set(i, { price: e.target.value })} />
          <Input label={t("services.duration")} inputMode="numeric" value={r.duration} onChange={(e) => set(i, { duration: e.target.value })} />
          <Input label={t("services.maxPets")} inputMode="numeric" value={r.maxPets} onChange={(e) => set(i, { maxPets: e.target.value })} />
          {rows.length > 1 ? <Button type="button" variant="ghost" size="sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>{t("remove")}</Button> : null}
        </fieldset>
      ))}
      <Button type="button" variant="secondary" size="sm" className="w-fit" onClick={() => setRows([...rows, blank()])}>{t("services.add")}</Button>
      {alert}
      <Button type="submit" isLoading={busy} className="w-fit">{t("saveAndContinue")}</Button>
    </form>
  );
}

function ProductsStep({ state, onSaved }: { state: PartnerOnboardingStateDto; onSaved: (s: PartnerOnboardingStateDto) => void }) {
  const t = useTranslations("partnerOnboarding");
  const sellerId = state.sellerOrganizationId!;
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SellerCatalogDirectoryItemDto[] | null>(null);
  const [picked, setPicked] = useState(() => state.products.map((p) => ({ productVariantId: p.productVariantId, label: [p.productTitle, p.variantTitle].filter(Boolean).join(" · "), price: toToman(p.priceIrr), stock: String(p.stock) })));
  const [requestTitle, setRequestTitle] = useState("");
  const [requestSent, setRequestSent] = useState(false);
  const { busy, run, alert, setError } = useSave();

  async function search() {
    try {
      setResults((await sellerOsService.searchCatalog(sellerId, { q: q.trim() })).items);
    } catch {
      setError(t("errors.generic"));
    }
  }
  async function requestProduct() {
    if (requestTitle.trim().length < 2) return;
    try {
      await sellerOsService.createCatalogProductRequest(sellerId, { requestedTitle: requestTitle.trim() });
      setRequestSent(true);
      setRequestTitle("");
    } catch {
      setError(t("products.requestLater"));
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-text-secondary">{t("products.hint")}</p>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <Input label={t("products.search")} value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" variant="secondary">{t("products.searchButton")}</Button>
      </form>
      {results ? (
        <ul className="flex flex-col gap-2">
          {results.length === 0 ? <li className="text-sm text-text-secondary">{t("products.noResults")}</li> : null}
          {results.flatMap((p) => p.variants.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle p-2 text-sm">
              <span>{p.title}{v.title ? ` · ${v.title}` : ""}{p.brandName ? <span className="text-text-secondary"> · {p.brandName}</span> : null}</span>
              <Button type="button" size="sm" variant="ghost" disabled={picked.some((x) => x.productVariantId === v.id)} onClick={() => setPicked([...picked, { productVariantId: v.id, label: [p.title, v.title].filter(Boolean).join(" · "), price: "", stock: "0" }])}>{t("products.add")}</Button>
            </li>
          )))}
        </ul>
      ) : null}
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => partnerOnboardingService.products(picked.map((x) => ({ productVariantId: x.productVariantId, priceIrr: toIrr(x.price), stock: Math.round(num(x.stock)) }))), onSaved);
        }}
      >
        <h3 className="text-sm font-bold">{t("products.picked")}</h3>
        {picked.length === 0 ? <p className="text-sm text-text-secondary">{t("products.nonePicked")}</p> : null}
        {picked.map((x, i) => (
          <div key={x.productVariantId} className="grid items-end gap-2 sm:grid-cols-[1fr_9rem_7rem_auto]">
            <span className="text-sm">{x.label}</span>
            <Input label={t("products.price")} inputMode="numeric" value={x.price} onChange={(e) => setPicked(picked.map((y, j) => (j === i ? { ...y, price: e.target.value } : y)))} />
            <Input label={t("products.stock")} inputMode="numeric" value={x.stock} onChange={(e) => setPicked(picked.map((y, j) => (j === i ? { ...y, stock: e.target.value } : y)))} />
            <Button type="button" variant="ghost" size="sm" onClick={() => setPicked(picked.filter((_, j) => j !== i))}>{t("remove")}</Button>
          </div>
        ))}
        {alert}
        <Button type="submit" isLoading={busy} className="w-fit">{t("saveAndContinue")}</Button>
      </form>
      <form className="flex flex-col gap-2 border-t border-border-subtle pt-3" onSubmit={(e) => { e.preventDefault(); void requestProduct(); }}>
        <h3 className="text-sm font-bold">{t("products.requestTitle")}</h3>
        <Input label={t("products.requestName")} value={requestTitle} onChange={(e) => setRequestTitle(e.target.value)} />
        {requestSent ? <p role="status" className="text-sm text-state-success">{t("products.requestSent")}</p> : null}
        <Button type="submit" variant="secondary" size="sm" className="w-fit">{t("products.requestButton")}</Button>
      </form>
    </div>
  );
}

function ReviewStep({ state, onSubmitted }: { state: PartnerOnboardingStateDto; onSubmitted: (s: PartnerOnboardingStateDto) => void }) {
  const t = useTranslations("partnerOnboarding");
  const { busy, run, alert } = useSave();
  const missing = [...new Set([...state.missing, ...state.verification.flatMap((v) => v.missingProfileFields.map(() => "PROFILE"))])];
  const missingDocs = [...new Set(state.verification.flatMap((v) => v.missingForSubmission))];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body">{t("review.body")}</p>
      {missing.length || missingDocs.length ? (
        <ul className="list-disc ps-5 text-sm text-state-attention">
          {missing.map((m) => <li key={m}>{t.has(`missing.${m}`) ? t(`missing.${m}` as "missing.ADDRESS") : m}</li>)}
          {missingDocs.map((k) => <li key={k}>{t("missing.document", { kind: t.has(`docKind.${k}`) ? t(`docKind.${k}` as "docKind.LICENSE") : k })}</li>)}
        </ul>
      ) : (
        <p className="text-sm text-state-success">{t("review.ready")}</p>
      )}
      {alert}
      <Button className="w-fit" isLoading={busy} disabled={missing.length > 0 || missingDocs.length > 0} onClick={() => void run(() => partnerOnboardingService.submit(), onSubmitted)}>{t("review.submit")}</Button>
    </div>
  );
}
