"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { PetFriendlyPlaceCategory } from "@petlife/types";
import { CircleAlert, CircleCheck, ImagePlus, LocateFixed, MapPin, Trash2 } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { formatLocaleDate } from "@/lib/i18n/format";
import type { RouteLocale } from "@/lib/i18n/config";
import { MapView, type MapPoint } from "@/features/maps/MapView";
import { placeSuggestionsService, type PlaceSuggestionDto } from "@/services/place-suggestions.service";
import "./place-suggest.css";

const TEHRAN: MapPoint = { latitude: 35.6892, longitude: 51.389 };
const CATEGORIES = Object.values(PetFriendlyPlaceCategory);
const LIMITS = { name: 200, city: 80, address: 300, notes: 1000 } as const;
/** Owner #6: up to three photos, JPEG/PNG/WebP, at most 10 MB each; private until staff approve the place. */
const PHOTO = { max: 3, maxBytes: 10 * 1024 * 1024, types: ["image/jpeg", "image/png", "image/webp"] } as const;
type Photo = { id: number; file: File; url: string };

/**
 * Suggest a pet-friendly place (owner, 2026-11-13): name, category, city, address and a map pin (staff need the
 * point to list it), optional notes. Sent to staff for review ("under review" right after sending); the member
 * sees their suggestions and what happened to them. The suggester is never shown publicly; the notes may become
 * the place's public description, and the form says so.
 */
export function PlaceSuggestView() {
  const t = useTranslations("places.suggest");
  const tc = useTranslations("places.category");
  const locale = useLocale() as RouteLocale;
  // «·» beside Persian/Arabic digits reads like a zero (۰): those languages separate with «،».
  const sep = locale === "fa" || locale === "ar" ? "، " : " · ";
  const [name, setName] = useState("");
  const [category, setCategory] = useState<PetFriendlyPlaceCategory | "">("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [pin, setPin] = useState<MapPoint | null>(null);
  const [center, setCenter] = useState<MapPoint>(TEHRAN);
  const [locating, setLocating] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<"name" | "category" | "city" | "pin", string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoSeq = useRef(0);
  const photoUrls = useRef(new Set<string>());

  // Local previews are the member's own picked files (blob URLs in <img>); release them when the page goes away.
  useEffect(() => {
    const urls = photoUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  function pickPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    setPhotoError(null);
    const room = PHOTO.max - photos.length;
    const accepted: Photo[] = [];
    for (const file of files) {
      if (!(PHOTO.types as readonly string[]).includes(file.type)) { setPhotoError(t("photos.errors.type")); continue; }
      if (file.size > PHOTO.maxBytes) { setPhotoError(t("photos.errors.tooLarge")); continue; }
      if (accepted.length >= room) { setPhotoError(t("photos.errors.max")); break; }
      const url = URL.createObjectURL(file);
      photoUrls.current.add(url);
      accepted.push({ id: ++photoSeq.current, file, url });
    }
    if (accepted.length) setPhotos((list) => [...list, ...accepted]);
  }

  function removePhoto(photo: Photo) {
    URL.revokeObjectURL(photo.url);
    photoUrls.current.delete(photo.url);
    setPhotos((list) => list.filter((p) => p.id !== photo.id));
  }

  /** Upload slot → PUT; returns the keys for photoObjectKeys (the server checks the bytes and strips photo metadata). */
  async function uploadPhotos(): Promise<string[]> {
    const keys: string[] = [];
    for (const photo of photos) {
      const slot = await placeSuggestionsService.photoUploadUrl({ contentType: photo.file.type, fileSizeBytes: photo.file.size });
      const put = await fetch(slot.uploadUrl, { method: slot.method, headers: slot.headers ?? { "Content-Type": photo.file.type }, body: photo.file, credentials: "omit" });
      if (!put.ok) throw Object.assign(new Error("photo upload failed"), { photoStatus: put.status });
      keys.push(slot.key);
    }
    return keys;
  }
  const [sent, setSent] = useState<PlaceSuggestionDto | null>(null);
  const [mine, setMine] = useState<PlaceSuggestionDto[] | null>(null);
  const [mineState, setMineState] = useState<"loading" | "ready" | "error">("loading");

  const loadMine = useCallback((signal?: AbortSignal) => {
    setMineState("loading");
    placeSuggestionsService
      .mine(signal)
      .then((list) => {
        setMine(list.filter((s) => s.kind === "NEW_PLACE"));
        setMineState("ready");
      })
      .catch(() => {
        if (!signal?.aborted) setMineState("error");
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadMine(controller.signal);
    return () => controller.abort();
  }, [loadMine]);

  function locate() {
    if (!navigator.geolocation) return setErrors((e) => ({ ...e, pin: t("errors.noLocation") }));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setPin(point);
        setCenter(point);
        setErrors((e) => ({ ...e, pin: undefined }));
        setLocating(false);
      },
      () => {
        setErrors((e) => ({ ...e, pin: t("errors.noLocation") }));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function validate() {
    const next: typeof errors = {};
    if (!name.trim()) next.name = t("errors.required");
    if (!category) next.category = t("errors.required");
    if (!city.trim()) next.city = t("errors.required");
    if (!pin) next.pin = t("errors.pin");
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!validate() || !pin || !category) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('.place-suggest [aria-invalid="true"], .place-suggest__pin-error')?.focus());
      return;
    }
    setSending(true);
    try {
      const photoObjectKeys = photos.length ? await uploadPhotos() : [];
      const created = await placeSuggestionsService.suggest({
        name: name.trim(),
        category,
        city: city.trim(),
        ...(address.trim() ? { address: address.trim() } : {}),
        latitude: Math.round(pin.latitude * 1e6) / 1e6,
        longitude: Math.round(pin.longitude * 1e6) / 1e6,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(photoObjectKeys.length ? { photoObjectKeys } : {}),
      });
      setSent(created);
      setMine((list) => [created, ...(list ?? [])]);
      setName(""); setCategory(""); setCity(""); setAddress(""); setNotes(""); setPin(null);
      photos.forEach((p) => { URL.revokeObjectURL(p.url); photoUrls.current.delete(p.url); });
      setPhotos([]);
    } catch (error) {
      const reason = error instanceof ApiError ? (error.details as { reason?: string } | undefined)?.reason : undefined;
      const photoStatus = (error as { photoStatus?: number }).photoStatus;
      setFormError(
        photoStatus === 415 ? t("photos.errors.notImage")
        : photoStatus !== undefined ? t("photos.errors.upload")
        : reason === "NOT_YOUR_UPLOAD" ? t("photos.errors.upload")
        : reason === "TOO_MANY_PENDING_SUGGESTIONS" ? t("errors.tooManyPending")
        : error instanceof ApiError && error.status === 429 ? t("errors.tooFast")
        : error instanceof ApiError && error.code === "VALIDATION_ERROR" ? t("errors.check")
        : t("errors.generic"),
      );
    } finally {
      setSending(false);
    }
  }

  const field = (key: keyof typeof errors) => (errors[key] ? { "aria-invalid": true as const, "aria-describedby": `place-suggest-${key}-error` } : {});
  const errorText = (key: keyof typeof errors) => (errors[key] ? <small id={`place-suggest-${key}-error`} className="place-suggest__error">{errors[key]}</small> : null);

  return (
    <div className="place-suggest">
      <header className="place-suggest__head">
        <p className="place-suggest__eyebrow"><MapPin size={16} aria-hidden="true" />{t("eyebrow")}</p>
        <h1>{t("title")}</h1>
        <p>{t("lede")}</p>
      </header>

      {sent ? (
        <div className="place-suggest__done" role="status">
          <CircleCheck size={24} aria-hidden="true" />
          <div>
            <h2>{t("done.title")}</h2>
            <p>{t("done.body")}</p>
            <button type="button" className="opl-btn soft sm" onClick={() => setSent(null)}>{t("done.another")}</button>
          </div>
        </div>
      ) : (
        <form className="place-suggest__form" onSubmit={(e) => void submit(e)} noValidate>
          <label className="place-suggest__field">
            <span>{t("fields.name")}</span>
            <input value={name} maxLength={LIMITS.name} onChange={(e) => setName(e.target.value)} autoComplete="off" required {...field("name")} />
            {errorText("name")}
          </label>
          <label className="place-suggest__field">
            <span>{t("fields.category")}</span>
            <select value={category} onChange={(e) => setCategory(e.target.value as PetFriendlyPlaceCategory | "")} required {...field("category")}>
              <option value="">{t("fields.categoryPick")}</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{tc(c)}</option>)}
            </select>
            {errorText("category")}
          </label>
          <label className="place-suggest__field">
            <span>{t("fields.city")}</span>
            <input value={city} maxLength={LIMITS.city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" required {...field("city")} />
            {errorText("city")}
          </label>
          <label className="place-suggest__field">
            <span>{t("fields.address")}</span>
            <textarea rows={2} value={address} maxLength={LIMITS.address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" />
          </label>

          <fieldset className="place-suggest__pin">
            <legend>{t("fields.pin")}</legend>
            <p className="place-suggest__hint">{t("pinHint")}</p>
            <MapView
              center={center}
              markers={pin ? [{ ...pin, id: "pin", kind: "pickup", label: t("pinned") }] : []}
              onPick={(point) => { setPin(point); setErrors((e) => ({ ...e, pin: undefined })); }}
              label={t("map")}
              zoomInLabel={t("zoomIn")}
              zoomOutLabel={t("zoomOut")}
              className="place-suggest__map"
            />
            <div className="place-suggest__pin-row">
              <button type="button" className="opl-btn line sm" onClick={locate} disabled={locating}>
                <LocateFixed size={16} aria-hidden="true" />{locating ? t("locating") : t("myLocation")}
              </button>
              <span role="status" className="place-suggest__pin-state">{pin ? t("pinSet") : null}</span>
            </div>
            {errors.pin ? <p className="place-suggest__error place-suggest__pin-error" tabIndex={-1}>{errors.pin}</p> : null}
          </fieldset>

          <label className="place-suggest__field">
            <span>{t("fields.notes")}</span>
            <textarea rows={3} value={notes} maxLength={LIMITS.notes} onChange={(e) => setNotes(e.target.value)} aria-describedby="place-suggest-notes-hint" />
            <small id="place-suggest-notes-hint" className="place-suggest__hint">{t("notesPublic")}</small>
          </label>

          <fieldset className="place-suggest__photos">
            <legend>{t("photos.label")}</legend>
            <p className="place-suggest__hint" id="place-suggest-photos-hint">{t("photos.hint")}</p>
            {photos.length ? (
              <ul className="place-suggest__thumbs">
                {photos.map((photo) => (
                  <li key={photo.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- the member's own picked JPEG/PNG/WebP, as a local preview */}
                    <img src={photo.url} alt={photo.file.name} />
                    <button type="button" className="place-suggest__thumb-remove" aria-label={t("photos.remove", { name: photo.file.name })} onClick={() => removePhoto(photo)}>
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {photos.length < PHOTO.max ? (
              <label className="place-suggest__add-photo">
                <input type="file" accept={PHOTO.types.join(",")} multiple onChange={pickPhotos} aria-describedby="place-suggest-photos-hint" />
                <ImagePlus size={18} aria-hidden="true" />
                <span>{t("photos.add")}</span>
              </label>
            ) : null}
            {photoError ? <p className="place-suggest__error" role="alert">{photoError}</p> : null}
          </fieldset>

          <p className="place-suggest__hint">{t("review")}</p>
          {formError ? <p className="place-suggest__alert" role="alert"><CircleAlert size={16} aria-hidden="true" />{formError}</p> : null}
          <button type="submit" className="opl-btn primary" disabled={sending} aria-busy={sending || undefined}>{sending ? t("sending") : t("send")}</button>
        </form>
      )}

      <section className="place-suggest__mine" aria-labelledby="place-suggest-mine">
        <h2 id="place-suggest-mine">{t("mine.title")}</h2>
        {mineState === "loading" && !mine ? <p role="status">{t("mine.loading")}</p>
        : mineState === "error" ? <p role="alert">{t("mine.error")} <button type="button" className="opl-btn line sm" onClick={() => loadMine()}>{t("mine.retry")}</button></p>
        : !mine?.length ? <p>{t("mine.empty")}</p>
        : (
          <ul>
            {mine.map((s) => (
              <li key={s.id}>
                <span className="place-suggest__mine-name"><strong dir="auto">{s.name}</strong><small>{[s.category ? tc(s.category) : null, s.city, formatLocaleDate(s.createdAt, locale), s.photoCount ? t("photos.count", { count: s.photoCount }) : null].filter(Boolean).join(sep)}</small></span>
                <span className={`place-suggest__status place-suggest__status--${s.status.toLowerCase()}`}>{t(`status.${s.status}`)}</span>
                {s.status === "APPROVED" && s.createdPlaceId ? <Link className="place-suggest__view" href={`/${locale}/places/${s.createdPlaceId}`}>{t("mine.view")}</Link> : null}
                {s.status === "REJECTED" && s.reviewNote ? <p className="place-suggest__note" dir="auto">{s.reviewNote}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
