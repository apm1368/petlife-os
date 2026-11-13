"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { WeightUnit, type SetPetCreateRequestInput, type SetPetDesignFileDto, type SetPetOptionsDto, type SetPetRequestDto, type SetPetSize, type SetPetZone } from "@petlife/types";
import { Check, ChevronLeft, ChevronRight, CircleAlert, FileText, Info, Minus, Plus, Trash2, Upload } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { formatLocaleNumber } from "@/lib/i18n/format";
import type { RouteLocale } from "@/lib/i18n/config";
import { setPetService } from "@/services/set-pet.service";
import { usePetStore } from "@/stores/pet-store";
import { GarmentMockups, type PreviewDesign } from "./GarmentMockups";
import { PetMeasureGuide, ShirtMeasureGuide } from "./MeasureGuides";
import {
  ALL_ZONES, COLOURS, DEFAULT_LIMITS, HUMAN_CHART, MEASUREMENT_KEYS, MEASUREMENT_RANGES, MIN_SHARP_DPI, PET_CHART, SIZES, ZONE_CM,
  checkMeasurement, isRasterPreviewable, parseMeasurement, printDpi, roundMeasurement, sizeLabel, suggestHumanSize, suggestPetSize, zoneSide,
  type MeasurementKey,
} from "./set-pet-catalog";
import { clearDraft, readDraft, readDraftFiles, saveDraft, type SetPetDraft } from "./draft-store";

const STEPS = ["shirts", "pet", "colour", "zones", "designs", "review"] as const;
type Step = (typeof STEPS)[number];

type DesignItem = {
  /** The server's file id, or a temporary "local-n" id until the file is uploaded. */
  id: string;
  name: string;
  previewUrl: string | null;
  /** "local": picked before signing in, kept on the device and uploaded when the request is sent. */
  status: "local" | "uploading" | "checking" | "ready" | "error";
  error?: string;
  file?: File;
  /** Raster size in pixels, for the print-quality warning. */
  px?: { w: number; h: number };
};

const usable = (d: DesignItem) => d.status === "ready" || d.status === "local";

/** Pixel size of a raster preview (resolves null when it can't be read). */
function measureImage(url: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * «ست پت» builder (owner, 2026-11-13): the member's T-shirts (one size per shirt) → the pet's shirt (measurements,
 * suggested size) → one colour → fixed print zones → designs, one per zone → review and send. From the colour step on,
 * the human and pet shirts are previewed side by side with every design on its zone. Nothing is paid here: staff
 * confirm the price and dates with a quote. Anyone can build (owner, #368 P4); signing in is asked only to send, and
 * the set waits on the device meanwhile (draft-store).
 */
export function SetPetBuilder({ signedIn, onSubmitted }: { signedIn: boolean; onSubmitted: (request: SetPetRequestDto) => void }) {
  const t = useTranslations("setPet.builder");
  const tz = useTranslations("setPet.zones");
  const tc = useTranslations("setPet.colours");
  const locale = useLocale() as RouteLocale;
  const pets = usePetStore((s) => s.pets);
  const activePetId = usePetStore((s) => s.activePetId);
  const router = useRouter();
  const num = (value: number) => formatLocaleNumber(value, locale);
  const [draft] = useState<SetPetDraft | null>(() => (typeof window === "undefined" ? null : readDraft()));

  const [options, setOptions] = useState<SetPetOptionsDto | null>(null);
  const [optionsState, setOptionsState] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const restoredStep = draft && (STEPS as readonly string[]).includes(draft.step) ? (draft.step as Step) : "shirts";
  const [step, setStep] = useState<Step>(restoredStep);
  const [reached, setReached] = useState(STEPS.indexOf(restoredStep));
  const [humanSizes, setHumanSizes] = useState<SetPetSize[]>(draft?.humanSizes?.length ? draft.humanSizes : ["M"]);
  const [hints, setHints] = useState<Array<{ height: string; weight: string }>>([]);
  const [petSize, setPetSize] = useState<SetPetSize>(draft?.petSize ?? "M");
  const [petSizeChosen, setPetSizeChosen] = useState(draft?.petSizeChosen ?? false);
  const [raw, setRaw] = useState<Record<MeasurementKey, string>>({ neckCm: "", chestCm: "", backLengthCm: "", weightKg: "", ...(draft?.raw ?? {}) });
  const [petId, setPetId] = useState<string>(draft?.petId ?? "");
  const [colour, setColour] = useState<string>(draft?.colour ?? "white");
  /** null = the pet's shirt matches the human colour (owner, #368 P13: same by default, changeable). */
  const [petColour, setPetColour] = useState<string | null>(draft?.petColour ?? null);
  const [zones, setZones] = useState<Set<SetPetZone>>(() => new Set<SetPetZone>(draft?.zones?.length ? draft.zones : ["FRONT_CENTER"]));
  const [placements, setPlacements] = useState<Partial<Record<SetPetZone, string>>>(draft?.placements ?? {});
  const [designs, setDesigns] = useState<DesignItem[]>([]);
  const [earlier, setEarlier] = useState<SetPetDesignFileDto[]>([]);
  const [side, setSide] = useState<"front" | "back">("front");
  const [previewShirt, setPreviewShirt] = useState(0);
  const [notes, setNotes] = useState(draft?.notes ?? "");
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<false | "uploading" | "sending">(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const blobUrls = useRef(new Set<string>());
  const seq = useRef(0);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Uploads finish after the member may have changed zones: read the zones at that moment, not at upload start.
  const zonesRef = useRef(zones);
  useEffect(() => {
    zonesRef.current = zones;
  }, [zones]);

  const limits = {
    acceptedExtensions: options?.acceptedExtensions ?? DEFAULT_LIMITS.acceptedExtensions,
    maxFileBytes: options?.maxFileBytes ?? DEFAULT_LIMITS.maxFileBytes,
    maxDesigns: options?.maxDesigns ?? DEFAULT_LIMITS.maxDesigns,
  };
  const maxDesigns = limits.maxDesigns;
  const maxGarments = Math.min(options?.maxHumanGarments ?? DEFAULT_LIMITS.maxHumanGarments, DEFAULT_LIMITS.maxHumanGarments);
  const accept = limits.acceptedExtensions.map((ext) => (ext.startsWith(".") ? ext : `.${ext}`)).join(",");
  const maxMb = num(Math.round(limits.maxFileBytes / 1_048_576));

  const loadOptions = useCallback(() => {
    const controller = new AbortController();
    // Options and earlier uploads need a session; visitors build on the published limits until they sign in.
    if (!signedIn) {
      setOptionsState("ready");
      return controller;
    }
    setOptionsState("loading");
    setPetService
      .options(controller.signal)
      .then((value) => {
        setOptions(value);
        setOptionsState("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setOptionsState(error instanceof ApiError && error.status === 404 ? "unavailable" : "error");
      });
    setPetService
      .looseDesigns(controller.signal)
      .then((files) => setEarlier(files.filter((file) => file.status === "READY")))
      .catch(() => undefined);
    return controller;
  }, [signedIn]);

  useEffect(() => {
    const controller = loadOptions();
    const urls = blobUrls.current;
    return () => {
      controller.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, [loadOptions]);

  // Designs picked before signing in come back from this device's IndexedDB.
  useEffect(() => {
    if (!draft?.files.length) return;
    let cancelled = false;
    void readDraftFiles(draft.files.map((f) => f.id)).then((found) => {
      if (cancelled || !found.size) return;
      const items: DesignItem[] = [];
      found.forEach((file, id) => {
        const name = draft.files.find((f) => f.id === id)?.name ?? file.name;
        const url = isRasterPreviewable({ name, type: file.type }) ? URL.createObjectURL(file) : null;
        if (url) blobUrls.current.add(url);
        items.push({ id, name, previewUrl: url, status: "local", file });
        seq.current = Math.max(seq.current, Number(id.replace("local-", "")) || 0);
      });
      setDesigns((list) => [...list, ...items]);
    });
    return () => {
      cancelled = true;
    };
  }, [draft]);

  // The pet this set is for: the active pet by default (optional; staff see the name).
  useEffect(() => {
    if (!petId && activePetId && pets.some((pet) => pet.id === activePetId)) setPetId(activePetId);
  }, [activePetId, petId, pets]);

  useEffect(() => {
    const pet = pets.find((p) => p.id === petId);
    if (pet?.latestWeightValue && pet.latestWeightUnit === WeightUnit.KG && !raw.weightKg) setRaw((r) => ({ ...r, weightKg: String(pet.latestWeightValue) }));
  }, [petId, pets, raw.weightKg]);

  const measured = useMemo(() => Object.fromEntries(MEASUREMENT_KEYS.map((key) => [key, parseMeasurement(raw[key])])) as Record<MeasurementKey, number | null>, [raw]);
  const suggested = suggestPetSize(measured.chestCm != null && checkMeasurement("chestCm", measured.chestCm) === "ok" ? measured.chestCm : null);

  // Until the member picks a pet size themselves, follow the chest measurement.
  useEffect(() => {
    if (!petSizeChosen && suggested) setPetSize(suggested);
  }, [petSizeChosen, suggested]);

  const previewDesigns = useMemo(() => new Map<string, PreviewDesign>(designs.filter(usable).map((d) => [d.id, { id: d.id, name: d.name, previewUrl: d.previewUrl }])), [designs]);
  const readyDesigns = designs.filter(usable);
  const activeDesigns = designs.filter((d) => d.status !== "error");
  const usedDesigns = new Set(Object.entries(placements).filter(([zone]) => zones.has(zone as SetPetZone)).map(([, id]) => id));

  // Owner, #368 P26: warn (never block) when a photo has too few pixels for its print area.
  const lowRes = ALL_ZONES.filter((zone) => zones.has(zone) && ZONE_CM[zone]).flatMap((zone) => {
    const design = designs.find((d) => d.id === placements[zone]);
    if (!design?.px) return [];
    const dpi = printDpi(Math.min(design.px.w, design.px.h), ZONE_CM[zone]!);
    return dpi < MIN_SHARP_DPI ? [t("upload.lowRes", { zone: tz(`${zone}.name`), dpi: num(dpi) })] : [];
  });

  function noteSize(id: string, url: string | null) {
    if (url) void measureImage(url).then((px) => px && setDesigns((list) => list.map((d) => (d.id === id ? { ...d, px } : d))));
  }

  function updateDesign(id: string, patch: Partial<DesignItem>) {
    setDesigns((list) => list.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  /** A new design fills every chosen zone that has none yet, so the preview shows it at once. */
  function assignToEmptyZones(designId: string) {
    setPlacements((current) => {
      const next = { ...current };
      zonesRef.current.forEach((zone) => {
        if (!next[zone]) next[zone] = designId;
      });
      return next;
    });
  }

  function toggleZone(zone: SetPetZone) {
    setStepError(null);
    const on = !zones.has(zone);
    setZones((current) => {
      const next = new Set(current);
      if (on) next.add(zone);
      else next.delete(zone);
      return next;
    });
    if (!on) return;
    if (zone !== "PET_BACK") setSide(zoneSide(zone));
    // With a single design uploaded, a newly ticked zone gets it straight away (the preview moves live).
    const only = readyDesigns.length === 1 ? readyDesigns[0]?.id : undefined;
    if (only) setPlacements((p) => (p[zone] ? p : { ...p, [zone]: only }));
  }

  function uploadErrorText(error: unknown): string {
    if (error instanceof ApiError) {
      if (error.code === "SET_PET_FILE_TYPE") return t("upload.errors.type");
      if (error.code === "SET_PET_TOO_MANY_FILES") return t("upload.errors.tooManyFiles");
      if (error.code === "SET_PET_FILE_NOT_UPLOADED") return t("upload.errors.notUploaded");
      if (error.code === "SET_PET_FILE_REJECTED") {
        const reason = (error.details as { reason?: string } | undefined)?.reason;
        if (reason === "TOO_LARGE") return t("upload.errors.tooLarge", { mb: maxMb });
        if (reason === "CONTENT_DOES_NOT_MATCH_TYPE") return t("upload.errors.mismatch");
        return t("upload.errors.rejected");
      }
    }
    return t("upload.errors.generic");
  }

  function pick(file: File) {
    const extension = file.name.toLowerCase().split(".").pop() ?? "";
    const allowed = limits.acceptedExtensions.map((ext) => ext.replace(/^\./, "").toLowerCase());
    const tempId = `local-${++seq.current}`;
    const fail = (error: string) => setDesigns((list) => [...list, { id: tempId, name: file.name, previewUrl: null, status: "error", error }]);
    if (!allowed.includes(extension)) return fail(t("upload.errors.type"));
    if (file.size > limits.maxFileBytes) return fail(t("upload.errors.tooLarge", { mb: maxMb }));

    // Only the member's own JPEG/PNG/WebP is previewed, from a local blob URL, in <img>. Never an SVG or print file.
    const localUrl = isRasterPreviewable(file) ? URL.createObjectURL(file) : null;
    if (localUrl) blobUrls.current.add(localUrl);
    const item: DesignItem = { id: tempId, name: file.name, previewUrl: localUrl, status: "local", file };
    setDesigns((list) => [...list, item]);
    noteSize(tempId, localUrl);
    if (signedIn) void upload(item);
    else assignToEmptyZones(tempId);
  }

  /** Upload target → PUT → complete. Returns the server id, or null when the file was refused. */
  async function upload(item: DesignItem): Promise<string | null> {
    const file = item.file!;
    const tempId = item.id;
    const localUrl = item.previewUrl;
    updateDesign(tempId, { status: "uploading", error: undefined });
    let id = tempId;
    try {
      const target = await setPetService.uploadTarget({ filename: file.name, contentType: file.type, fileSizeBytes: file.size });
      id = target.file.id;
      setDesigns((list) => list.map((d) => (d.id === tempId ? { ...d, id } : d)));
      const put = await fetch(target.uploadUrl, { method: target.method, headers: target.headers ?? (file.type ? { "Content-Type": file.type } : undefined), body: file, credentials: "omit" });
      if (!put.ok) throw new Error(`upload ${put.status}`);
      updateDesign(id, { status: "checking" });
      const done = await setPetService.completeDesign(id);
      if (done.status !== "READY") throw new ApiError({ code: "SET_PET_FILE_REJECTED", message: "rejected", requestId: "client", details: { reason: done.rejectReason ?? undefined } }, 422);
      updateDesign(id, { status: "ready", previewUrl: done.previewable ? localUrl : null, file: undefined });
      // The design keeps its zones under its new server id.
      setPlacements((current) => Object.fromEntries(Object.entries(current).map(([zone, d]) => [zone, d === tempId ? id : d])));
      assignToEmptyZones(id);
      return id;
    } catch (error) {
      updateDesign(id, { status: "error", error: uploadErrorText(error) });
      return null;
    }
  }

  function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    setStepError(null);
    const room = Math.max(0, maxDesigns - activeDesigns.length);
    files.slice(0, room).forEach((file) => pick(file));
    if (files.length > room) setStepError(t("upload.errors.max", { max: num(maxDesigns) }));
  }

  async function removeDesign(item: DesignItem) {
    setDesigns((list) => list.filter((d) => d.id !== item.id));
    setPlacements((current) => Object.fromEntries(Object.entries(current).filter(([, id]) => id !== item.id)));
    if (item.previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(item.previewUrl);
      blobUrls.current.delete(item.previewUrl);
    }
    if (signedIn && !item.id.startsWith("local-") && item.status !== "uploading") await setPetService.removeDesign(item.id).catch(() => undefined);
  }

  async function pickEarlier(file: SetPetDesignFileDto) {
    if (activeDesigns.length >= maxDesigns) return setStepError(t("upload.errors.max", { max: num(maxDesigns) }));
    setEarlier((list) => list.filter((f) => f.id !== file.id));
    setDesigns((list) => [...list, { id: file.id, name: file.originalFilename ?? t("upload.untitled"), previewUrl: null, status: "ready" }]);
    assignToEmptyZones(file.id);
    if (file.previewable) {
      const preview = await setPetService.previewDesign(file.id).catch(() => null);
      if (preview?.url.startsWith("/") || preview?.url.startsWith(window.location.origin)) updateDesign(file.id, { previewUrl: preview.url });
    }
  }

  async function deleteEarlier(file: SetPetDesignFileDto) {
    setEarlier((list) => list.filter((f) => f.id !== file.id));
    await setPetService.removeDesign(file.id).catch(() => undefined);
  }

  function snapshot(at: Step, files: Map<string, File>): SetPetDraft {
    return {
      step: at, humanSizes, petSize, petSizeChosen, raw, petId, colour, petColour, zones: [...zones], notes,
      placements: Object.fromEntries(Object.entries(placements).filter(([, id]) => id && (files.has(id) || !id.startsWith("local-")))),
      files: [...files.keys()].map((id) => ({ id, name: designs.find((d) => d.id === id)?.name ?? "" })),
    };
  }

  function validate(target: Step): string | null {
    if (target === "pet") {
      const bad = MEASUREMENT_KEYS.find((key) => checkMeasurement(key, measured[key]) !== "ok");
      return bad ? t("pet.errors.fix") : null;
    }
    if (target === "zones" && zones.size === 0) return t("zones.errors.none");
    if (target === "designs") {
      if (designs.some((d) => d.status === "uploading" || d.status === "checking")) return t("upload.errors.wait");
      const missing = ALL_ZONES.filter((zone) => zones.has(zone)).find((zone) => !placements[zone] || !previewDesigns.has(placements[zone]!));
      if (missing) return t("upload.errors.zoneMissing", { zone: tz(`${missing}.name`) });
      if (usedDesigns.size > maxDesigns) return t("upload.errors.max", { max: num(maxDesigns) });
    }
    return null;
  }

  function go(target: Step) {
    const from = STEPS.indexOf(step);
    const to = STEPS.indexOf(target);
    if (to > from) {
      for (const s of STEPS.slice(from, to)) {
        const error = validate(s);
        if (error) {
          setStep(s);
          setStepError(error);
          requestAnimationFrame(() => errorRef.current?.focus());
          return;
        }
      }
    }
    setStepError(null);
    setStep(target);
    setReached((r) => Math.max(r, to));
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  async function submit() {
    for (const s of STEPS) {
      const error = validate(s);
      if (error) {
        setStep(s);
        setStepError(error);
        return;
      }
    }
    if (!signedIn) {
      // Keep the set on this device, then sign in (the in-page sign-in sheet) and come back to send it.
      const files = new Map<string, File>();
      designs.forEach((d) => d.status === "local" && d.file && files.set(d.id, d.file));
      await saveDraft(snapshot("review", files), files);
      router.push(`/${locale}/welcome?returnTo=${encodeURIComponent(`/${locale}/set-pet?resume=1#setpet-builder`)}`);
      return;
    }
    setSubmitError(null);
    const ids = new Map<string, string>();
    const local = designs.filter((d) => d.status === "local" && usedDesigns.has(d.id));
    if (local.length) {
      setSubmitting("uploading");
      for (const item of local) {
        const id = await upload(item);
        if (!id) {
          setSubmitting(false);
          setStep("designs");
          setStepError(t("upload.errors.someFailed"));
          return;
        }
        ids.set(item.id, id);
      }
    }
    const input: SetPetCreateRequestInput = {
      humanColour: colour,
      humanSizes,
      petSize,
      petColour: petColour ?? colour,
      petMeasurements: {
        neckCm: roundMeasurement("neckCm", measured.neckCm ?? 0),
        chestCm: roundMeasurement("chestCm", measured.chestCm ?? 0),
        backLengthCm: roundMeasurement("backLengthCm", measured.backLengthCm ?? 0),
        weightKg: roundMeasurement("weightKg", measured.weightKg ?? 0),
      },
      placements: ALL_ZONES.filter((zone) => zones.has(zone)).map((zone) => ({ zone, designFileId: ids.get(placements[zone]!) ?? placements[zone]! })),
      ...(petId ? { petId } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    setSubmitting("sending");
    try {
      const request = await setPetService.create(input);
      void clearDraft();
      onSubmitted(request);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      setSubmitError(
        code === "SET_PET_TOO_MANY_OPEN" ? t("review.errors.tooManyOpen")
        : code === "SET_PET_DESIGN_UNAVAILABLE" ? t("review.errors.designUnavailable")
        : code === "VALIDATION_ERROR" ? t("review.errors.validation")
        : error instanceof ApiError && error.status === 404 ? t("review.errors.unavailable")
        : t("review.errors.generic"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (optionsState === "loading") return <p className="setpet-state" role="status">{t("loading")}</p>;
  if (optionsState === "unavailable") return <p className="setpet-state" role="status">{t("comingSoon")}</p>;
  if (optionsState === "error") {
    return (
      <div className="setpet-state" role="alert">
        <p>{t("loadError")}</p>
        <button type="button" className="opl-btn soft sm" onClick={() => loadOptions()}>{t("retry")}</button>
      </div>
    );
  }

  const index = STEPS.indexOf(step);
  const showPreview = index >= STEPS.indexOf("colour");
  const shirtForPreview = humanSizes[Math.min(previewShirt, humanSizes.length - 1)] ?? "M";
  const fieldError = (key: MeasurementKey) => {
    const state = checkMeasurement(key, measured[key]);
    if (state === "ok" || (state === "empty" && !stepError)) return null;
    const { min, max } = MEASUREMENT_RANGES[key];
    return state === "empty" ? t("pet.errors.required") : t("pet.errors.range", { min: num(min), max: num(max) });
  };

  return (
    <div className="setpet-builder">
      <ol className="setpet-steps" aria-label={t("stepsLabel")}>
        {STEPS.map((s, i) => (
          <li key={s} className={s === step ? "is-current" : i < index ? "is-done" : undefined}>
            <button type="button" onClick={() => go(s)} disabled={i > reached && i > index} aria-current={s === step ? "step" : undefined}>
              <span className="setpet-steps__n" aria-hidden="true">{i < index ? <Check size={14} /> : num(i + 1)}</span>
              <span>{t(`steps.${s}`)}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className={`setpet-stage${showPreview ? " has-preview" : ""}`}>
        <section className="setpet-panel" aria-labelledby="setpet-step-title">
          <h2 id="setpet-step-title" ref={headingRef} tabIndex={-1}>{t(`${step}.title`)}</h2>
          <p className="setpet-panel__lede">{t(`${step}.lede`)}</p>

          {step === "shirts" ? (
            <>
              <div className="setpet-count">
                <span id="setpet-count-label">{t("shirts.count")}</span>
                <div className="setpet-count__ctl" role="group" aria-labelledby="setpet-count-label">
                  <button type="button" className="opl-iconbtn" aria-label={t("shirts.fewer")} disabled={humanSizes.length <= 1} onClick={() => { setHumanSizes((s) => s.slice(0, -1)); setPreviewShirt(0); }}><Minus size={18} aria-hidden="true" /></button>
                  <output aria-live="polite">{num(humanSizes.length)}</output>
                  <button type="button" className="opl-iconbtn" aria-label={t("shirts.more")} disabled={humanSizes.length >= maxGarments} onClick={() => setHumanSizes((s) => [...s, s[s.length - 1] ?? "M"])}><Plus size={18} aria-hidden="true" /></button>
                </div>
              </div>
              {humanSizes.map((size, i) => {
                const hint = hints[i] ?? { height: "", weight: "" };
                const tip = suggestHumanSize(parseMeasurement(hint.height), parseMeasurement(hint.weight));
                const setHint = (patch: Partial<typeof hint>) => setHints((list) => { const next = [...list]; next[i] = { ...hint, ...patch }; return next; });
                const choose = (s: SetPetSize) => setHumanSizes((list) => list.map((v, j) => (j === i ? s : v)));
                return (
                  <fieldset key={i} className="setpet-sizes">
                    <legend>{t("shirts.sizeFor", { n: num(i + 1) })}</legend>
                    <div className="setpet-seg">
                      {SIZES.map((s) => (
                        <label key={s} className={s === size ? "is-on" : undefined}>
                          <input type="radio" name={`setpet-human-${i}`} value={s} checked={s === size} onChange={() => choose(s)} />
                          <span dir="ltr">{sizeLabel(s)}</span>
                        </label>
                      ))}
                    </div>
                    <details className="setpet-hint">
                      <summary>{t("shirts.suggest")}</summary>
                      <div className="setpet-hint__fields">
                        <label className="setpet-field">
                          <span>{t("shirts.height")}<span className="sr-only"> ({t("cm")})</span></span>
                          <input inputMode="numeric" autoComplete="off" value={hint.height} onChange={(e) => setHint({ height: e.target.value })} />
                        </label>
                        <label className="setpet-field">
                          <span>{t("shirts.weight")}<span className="sr-only"> ({t("kg")})</span></span>
                          <input inputMode="decimal" autoComplete="off" value={hint.weight} onChange={(e) => setHint({ weight: e.target.value })} />
                        </label>
                      </div>
                      {tip ? (
                        <p className="setpet-suggest" role="status">
                          {t("shirts.suggested", { size: sizeLabel(tip) })}
                          {tip !== size ? <button type="button" className="opl-btn soft sm" onClick={() => choose(tip)}>{t("shirts.use", { size: sizeLabel(tip) })}</button> : null}
                        </p>
                      ) : null}
                    </details>
                    {tip && tip !== size ? <p className="setpet-note">{t("shirts.mismatch", { size: sizeLabel(tip) })}</p> : null}
                  </fieldset>
                );
              })}
              <div className="setpet-chart">
                <ShirtMeasureGuide title={t("shirts.guideTitle")} />
                <table>
                  <caption>{t("shirts.chartCaption")}</caption>
                  <thead><tr><th scope="col">{t("size")}</th><th scope="col">{t("shirts.chest")}</th><th scope="col">{t("shirts.length")}</th></tr></thead>
                  <tbody>
                    {SIZES.map((s) => (
                      <tr key={s} className={humanSizes.includes(s) ? "is-on" : undefined}>
                        <th scope="row" dir="ltr">{sizeLabel(s)}</th>
                        <td>{num(HUMAN_CHART[s].chestWidthCm)}</td>
                        <td>{num(HUMAN_CHART[s].lengthCm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="setpet-note"><Info size={16} aria-hidden="true" />{t("approximate")}</p>
            </>
          ) : null}

          {step === "pet" ? (
            <>
              {pets.length ? (
                <label className="setpet-field">
                  <span>{t("pet.which")}</span>
                  <select value={petId} onChange={(e) => setPetId(e.target.value)}>
                    <option value="">{t("pet.noPet")}</option>
                    {pets.map((pet) => <option key={pet.id} value={pet.id}>{pet.name}</option>)}
                  </select>
                </label>
              ) : null}
              <div className="setpet-chart setpet-chart--pet">
                <PetMeasureGuide title={t("pet.guideTitle")} />
                <ol className="setpet-guide-steps">
                  <li>{t("pet.guide.neck")}</li>
                  <li>{t("pet.guide.chest")}</li>
                  <li>{t("pet.guide.back")}</li>
                </ol>
              </div>
              <div className="setpet-measures">
                {MEASUREMENT_KEYS.map((key, i) => {
                  const error = fieldError(key);
                  const id = `setpet-m-${key}`;
                  const unit = key === "weightKg" ? t("kg") : t("cm");
                  return (
                    <div key={key} className="setpet-field">
                      <label htmlFor={id}>
                        {key === "weightKg" ? t("pet.fields.weightKg") : `${num(i + 1)}. ${t(`pet.fields.${key}`)}`}
                        <span className="sr-only"> ({unit})</span>
                      </label>
                      <span className="setpet-field__unit">
                        <input id={id} inputMode="decimal" autoComplete="off" value={raw[key]} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}
                          onChange={(e) => { setStepError(null); setRaw((r) => ({ ...r, [key]: e.target.value })); }} />
                        <small aria-hidden="true">{unit}</small>
                      </span>
                      {error ? <small id={`${id}-error`} className="setpet-field__error">{error}</small> : null}
                    </div>
                  );
                })}
              </div>
              <fieldset className="setpet-sizes">
                <legend>{t("pet.size")}</legend>
                {suggested ? <p className="setpet-suggest" role="status">{t("pet.suggested", { size: sizeLabel(suggested) })}</p> : null}
                <div className="setpet-seg">
                  {SIZES.map((s) => (
                    <label key={s} className={s === petSize ? "is-on" : undefined}>
                      <input type="radio" name="setpet-pet-size" value={s} checked={s === petSize} onChange={() => { setPetSize(s); setPetSizeChosen(true); }} />
                      <span dir="ltr">{sizeLabel(s)}</span>
                    </label>
                  ))}
                </div>
                {suggested && suggested !== petSize ? <p className="setpet-note">{t("pet.mismatch", { size: sizeLabel(suggested) })}</p> : null}
              </fieldset>
              <table className="setpet-table">
                <caption>{t("pet.chartCaption")}</caption>
                <thead><tr><th scope="col">{t("size")}</th><th scope="col">{t("pet.fields.neckCm")}</th><th scope="col">{t("pet.fields.chestCm")}</th><th scope="col">{t("pet.fields.backLengthCm")}</th></tr></thead>
                <tbody>
                  {SIZES.map((s) => (
                    <tr key={s} className={s === petSize ? "is-on" : undefined}>
                      <th scope="row" dir="ltr">{sizeLabel(s)}</th>
                      {(["neckCm", "chestCm", "backLengthCm"] as const).map((key) => <td key={key}>{t("range", { min: num(PET_CHART[s][key][0]), max: num(PET_CHART[s][key][1]) })}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="setpet-note"><Info size={16} aria-hidden="true" />{t("approximate")}</p>
            </>
          ) : null}

          {step === "colour" ? (
            <>
              <fieldset className="setpet-colours">
                <legend className={petColour ? undefined : "sr-only"}>{petColour ? t("colour.human") : t("colour.title")}</legend>
                {COLOURS.map((c) => (
                  <label key={c.id} className={c.id === colour ? "is-on" : undefined}>
                    <input type="radio" name="setpet-colour" value={c.id} checked={c.id === colour} onChange={() => setColour(c.id)} />
                    <span className="setpet-swatch" style={{ background: c.hex }} aria-hidden="true" />
                    <span>{tc(c.id)}</span>
                  </label>
                ))}
              </fieldset>
              <label className="setpet-check">
                <input type="checkbox" checked={petColour !== null} onChange={(e) => setPetColour(e.target.checked ? colour : null)} />
                <span>{t("colour.petDifferent")}</span>
              </label>
              {petColour ? (
                <fieldset className="setpet-colours">
                  <legend>{t("colour.petColour")}</legend>
                  {COLOURS.map((c) => (
                    <label key={c.id} className={c.id === petColour ? "is-on" : undefined}>
                      <input type="radio" name="setpet-pet-colour" value={c.id} checked={c.id === petColour} onChange={() => setPetColour(c.id)} />
                      <span className="setpet-swatch" style={{ background: c.hex }} aria-hidden="true" />
                      <span>{tc(c.id)}</span>
                    </label>
                  ))}
                </fieldset>
              ) : null}
            </>
          ) : null}

          {step === "zones" ? (
            <fieldset className="setpet-zones">
              <legend className="sr-only">{t("zones.title")}</legend>
              {ALL_ZONES.map((zone) => (
                <label key={zone} className={zones.has(zone) ? "is-on" : undefined}>
                  <input type="checkbox" checked={zones.has(zone)} onChange={() => toggleZone(zone)} />
                  <span>
                    <strong>{tz(`${zone}.name`)}</strong>
                    <small>{ZONE_CM[zone] ? t("zones.area", { cm: num(ZONE_CM[zone]!) }) : t("zones.petArea")} · {tz(`${zone}.hint`)}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}

          {step === "designs" ? (
            <>
              <label className={`setpet-upload${activeDesigns.length >= maxDesigns ? " is-full" : ""}`}>
                <input type="file" accept={accept || undefined} multiple disabled={activeDesigns.length >= maxDesigns} onChange={onFiles} />
                <Upload size={22} aria-hidden="true" />
                <strong>{t("upload.choose")}</strong>
                <small>{t("upload.limits", { max: num(maxDesigns), mb: maxMb })}</small>
                <small>{t("upload.formats")}</small>
              </label>
              {designs.length ? (
                <ul className="setpet-files" aria-live="polite">
                  {designs.map((d) => (
                    <li key={d.id} className={`is-${d.status}`}>
                      <span className="setpet-files__thumb" aria-hidden="true">
                        {d.previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- local blob / short-lived same-origin raster preview
                          <img src={d.previewUrl} alt="" />
                        ) : <FileText size={20} />}
                      </span>
                      <span className="setpet-files__name">
                        <strong dir="auto">{d.name}</strong>
                        <small>{d.status === "error" ? d.error : usable(d) && !d.previewUrl ? t("upload.receivedNoPreview") : t(`upload.status.${d.status}`)}</small>
                      </span>
                      <button type="button" className="opl-iconbtn" aria-label={t("upload.remove", { name: d.name })} disabled={d.status === "uploading" || d.status === "checking"} onClick={() => void removeDesign(d)}>
                        <Trash2 size={18} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {lowRes.map((warning) => <p key={warning} className="setpet-note setpet-note--warn"><CircleAlert size={16} aria-hidden="true" />{warning}</p>)}
              {earlier.length ? (
                <details className="setpet-earlier">
                  <summary>{t("upload.earlier", { n: num(earlier.length) })}</summary>
                  <ul>
                    {earlier.map((file) => (
                      <li key={file.id}>
                        <span dir="auto">{file.originalFilename ?? t("upload.untitled")}</span>
                        <button type="button" className="opl-btn soft sm" onClick={() => void pickEarlier(file)}>{t("upload.use")}</button>
                        <button type="button" className="opl-btn line sm" onClick={() => void deleteEarlier(file)}>{t("upload.delete")}</button>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {zones.size ? (
                <div className="setpet-assign">
                  <h3>{t("upload.assignTitle")}</h3>
                  {ALL_ZONES.filter((zone) => zones.has(zone)).map((zone) => (
                    <label key={zone} className="setpet-field">
                      <span>{tz(`${zone}.name`)}</span>
                      <select value={placements[zone] ?? ""} onChange={(e) => setPlacements((p) => ({ ...p, [zone]: e.target.value || undefined }))} disabled={!readyDesigns.length}>
                        <option value="">{t("upload.pick")}</option>
                        {readyDesigns.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}

          {step === "review" ? (
            <>
              <dl className="setpet-review">
                <div><dt>{t("review.shirts")}</dt><dd>{t("review.shirtsValue", { n: num(humanSizes.length), sizes: humanSizes.map(sizeLabel).join(locale === "fa" || locale === "ar" ? "، " : ", ") })}</dd></div>
                <div><dt>{t("review.pet")}</dt><dd>{t("review.petValue", { size: sizeLabel(petSize), name: pets.find((p) => p.id === petId)?.name ?? t("pet.noPet") })}</dd></div>
                <div><dt>{t("review.measurements")}</dt><dd>{t("review.measurementsValue", { neck: num(measured.neckCm ?? 0), chest: num(measured.chestCm ?? 0), back: num(measured.backLengthCm ?? 0), weight: num(measured.weightKg ?? 0) })}</dd></div>
                <div><dt>{t("review.colour")}</dt><dd>{petColour && petColour !== colour ? `${tc(colour)} · ${t("colour.petColour")}: ${tc(petColour)}` : tc(colour)}</dd></div>
                <div><dt>{t("review.zones")}</dt><dd><ul>{ALL_ZONES.filter((zone) => zones.has(zone)).map((zone) => <li key={zone}>{tz(`${zone}.name`)}: <span dir="auto">{previewDesigns.get(placements[zone] ?? "")?.name}</span></li>)}</ul></dd></div>
              </dl>
              <label className="setpet-field">
                <span>{t("review.notes")}</span>
                <textarea rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("review.notesPlaceholder")} />
              </label>
              {lowRes.map((warning) => <p key={warning} className="setpet-note setpet-note--warn"><CircleAlert size={16} aria-hidden="true" />{warning}</p>)}
              <p className="setpet-note"><Info size={16} aria-hidden="true" />{t("review.priceNote")}</p>
              {!signedIn ? <p className="setpet-note"><Info size={16} aria-hidden="true" />{t("review.signInNote")}</p> : null}
              {submitError ? <p className="setpet-error" role="alert"><CircleAlert size={16} aria-hidden="true" />{submitError}</p> : null}
            </>
          ) : null}

          {stepError ? <p ref={errorRef} tabIndex={-1} className="setpet-error" role="alert"><CircleAlert size={16} aria-hidden="true" />{stepError}</p> : null}

          <div className="setpet-nav">
            {index > 0 ? (
              <button type="button" className="opl-btn line" onClick={() => go(STEPS[index - 1] ?? "shirts")}>
                <ChevronRight size={18} aria-hidden="true" className="setpet-nav__back" />
                {t("back")}
              </button>
            ) : <span />}
            {step === "review" ? (
              <button type="button" className="opl-btn primary" disabled={submitting !== false} aria-busy={submitting ? true : undefined} onClick={() => void submit()}>
                {submitting === "uploading" ? t("review.uploading") : submitting ? t("review.sending") : signedIn ? t("review.send") : t("review.signInToSend")}
              </button>
            ) : (
              <button type="button" className="opl-btn primary" onClick={() => go(STEPS[index + 1] ?? "review")}>
                {t("next")}
                <ChevronLeft size={18} aria-hidden="true" className="setpet-nav__next" />
              </button>
            )}
          </div>
        </section>

        {showPreview ? (
          <aside className="setpet-aside" aria-label={t("previewLabel")}>
            {humanSizes.length > 1 ? (
              <div className="setpet-seg setpet-seg--small" role="group" aria-label={t("previewShirt")}>
                {humanSizes.map((s, i) => (
                  <button key={i} type="button" aria-pressed={i === Math.min(previewShirt, humanSizes.length - 1)} onClick={() => setPreviewShirt(i)}>
                    {t("shirtN", { n: num(i + 1) })} · <span dir="ltr">{sizeLabel(s)}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <GarmentMockups humanSize={shirtForPreview} petSize={petSize} colour={colour} petColour={petColour ?? colour} side={side} onSideChange={setSide} zones={zones} placements={placements} designs={previewDesigns}
              onToggleZone={step === "zones" || step === "designs" ? toggleZone : undefined} />
            <p className="setpet-note"><Info size={16} aria-hidden="true" />{t("previewNote")}</p>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
