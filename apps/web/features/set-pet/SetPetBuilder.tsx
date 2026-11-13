"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  priceRangeSetPet,
  priceSetPet,
  setPetWearerOf,
  type PetDto,
  type SetPetDesignFileDto,
  type SetPetGarment,
  type SetPetOptionsDto,
  type SetPetRequestDto,
  type SetPetSize,
  type SetPetZone,
} from "@petlife/types";
import { Check, ChevronLeft, ChevronRight, CircleAlert, FileText, Info, Plus, Trash2, Upload } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import { formatLocaleNumber } from "@/lib/i18n/format";
import type { RouteLocale } from "@/lib/i18n/config";
import { setPetService } from "@/services/set-pet.service";
import { householdsService } from "@/services/households.service";
import type { PrintPreview } from "./GarmentMockups";
import { FONT_FAMILY } from "./GarmentMockups";
import { SetPetPreview } from "./SetPetPreview";
import { BUILDER_STEPS, emptySnapshot, newKey, readSnapshot, toOrderInput, type BuilderSnapshot, type BuilderStep, type ItemState, type PrintState } from "./builder-state";
import { clearDraft, readDraft, readDraftFiles, saveDraft, saveDraftChoices } from "./draft-store";
import {
  ALL_ZONES, COLOURS, HUMAN_CHART, HUMAN_GARMENTS, MIN_SHARP_DPI, PET_CHART, PET_GARMENTS, SIZES, ZONE_CM,
  isRasterPreviewable, parseNumber, petSizeMismatch, printDpi, sizeLabel, suggestHumanSize,
} from "./set-pet-catalog";

type DesignItem = {
  /** The server's file id, or a temporary "local-n" id until the file is uploaded. */
  id: string;
  name: string;
  previewUrl: string | null;
  /** "local": picked before signing in, kept on the device and uploaded when the order is sent. */
  status: "local" | "uploading" | "checking" | "ready" | "error";
  error?: string;
  file?: File;
  /** Raster size in pixels, for the print-quality warning (owner P26). */
  px?: { w: number; h: number };
};

const usable = (d: DesignItem) => d.status === "ready" || d.status === "local";
const isPet = (g: SetPetGarment) => setPetWearerOf(g) === "PET";
const MEMORIAL = new Set(["LOST", "DECEASED", "MEMORIAL"]);

/** Pixel size of a raster preview (resolves null when it can't be read). */
function measureImage(url: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** The member's dogs and cats, including pets that are lost or have died (owner P8, P11, P18). */
function useDogsAndCats(signedIn: boolean): PetDto[] {
  const [pets, setPets] = useState<PetDto[]>([]);
  useEffect(() => {
    if (!signedIn) return setPets([]);
    let cancelled = false;
    void (async () => {
      try {
        const households = await householdsService.listMine();
        const lists = await Promise.all(households.map((h) => householdsService.listPets(h.id)));
        if (!cancelled) setPets(lists.flat().filter((p) => String(p.species) === "DOG" || String(p.species) === "CAT"));
      } catch {
        if (!cancelled) setPets([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);
  return pets;
}

const petWeightKg = (p: PetDto | undefined) => (p?.latestWeightValue == null ? null : p.latestWeightUnit === "LB" ? p.latestWeightValue * 0.4536 : p.latestWeightValue);

type Props = {
  signedIn: boolean;
  /** Opening the builder on a sent order (owner P39: edit until the proof is approved). */
  editOrder?: SetPetRequestDto | null;
  /** A draft the page already has (a one-click reorder, P40). */
  initial?: BuilderSnapshot | null;
  onSubmitted: (order: SetPetRequestDto, edited: boolean) => void;
};

/**
 * «ست پت» builder (owner's #368 answers): garments for people (tee, hoodie or sweatshirt, up to five) and for pets
 * (tee/vest, hoodie or bandana; dogs and cats, from the profile or typed by hand) → prints on the fixed zones (designs
 * or text in three fonts, simple zoom and move) → review with the exact price from the fixed table → send. A price
 * range shows while building. The preview is a rotatable 3D view (or flat with a cm ruler). Anyone can build;
 * signing in is asked only to send (P4). Signed-in members' work is auto-saved to their account (P5).
 */
export function SetPetBuilder({ signedIn, editOrder, initial, onSubmitted }: Props) {
  const t = useTranslations("setPet.builder");
  const tz = useTranslations("setPet.zones");
  const tc = useTranslations("setPet.colours");
  const tg = useTranslations("setPet.garments");
  const tf = useTranslations("setPet.fonts");
  const locale = useLocale() as RouteLocale;
  const router = useRouter();
  const num = (value: number) => formatLocaleNumber(value, locale);
  const money = (irr: number) => formatCurrency(irr, locale);
  const pets = useDogsAndCats(signedIn);

  const [options, setOptions] = useState<SetPetOptionsDto | null>(null);
  const [optionsState, setOptionsState] = useState<"loading" | "ready" | "error">("loading");
  const [s, setS] = useState<BuilderSnapshot>(() => {
    if (editOrder) return readSnapshot({ ...editOrder, step: "garments", prints: undefined }) ?? emptySnapshot();
    if (initial) return initial;
    const local = typeof window === "undefined" ? null : readDraft();
    return (local && readSnapshot(local.snapshot)) || emptySnapshot();
  });
  const [designs, setDesigns] = useState<DesignItem[]>([]);
  const [library, setLibrary] = useState<SetPetDesignFileDto[]>([]);
  const [zone, setZone] = useState<SetPetZone | null>(null);
  const [reached, setReached] = useState(BUILDER_STEPS.indexOf(s.step));
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<false | "uploading" | "sending">(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [hints, setHints] = useState<Record<string, { height: string; weight: string }>>({});
  const blobUrls = useRef(new Set<string>());
  const seq = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const accountDraftChecked = useRef(!!editOrder || !!initial);
  const update = useCallback((patch: Partial<BuilderSnapshot> | ((prev: BuilderSnapshot) => Partial<BuilderSnapshot>)) => {
    setS((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }));
  }, []);

  const step = s.step;
  const humans = s.items.filter((i) => !isPet(i.garment));
  const petItems = s.items.filter((i) => isPet(i.garment));
  const limits = options?.limits;
  const maxHumans = limits?.maxHumanGarments ?? 5;
  const maxPets = limits?.maxPetGarments ?? 12;
  const maxMb = num(Math.round((limits?.maxFileBytes ?? 50 * 1024 * 1024) / 1_048_576));
  const accept = (options?.acceptedExtensions ?? ["jpg", "jpeg", "png", "webp", "heic", "heif", "pdf", "svg", "ai", "psd"]).map((e) => `.${e}`).join(",");
  const memorialPets = pets.filter((p) => MEMORIAL.has(String(p.lifecycleStatus)));
  const activePets = pets.filter((p) => String(p.lifecycleStatus) === "ACTIVE");

  // ---------------------------------------------------------------------------------------------- loading

  const loadOptions = useCallback(() => {
    const controller = new AbortController();
    setOptionsState("loading");
    setPetService
      .options(controller.signal)
      .then((value) => {
        setOptions(value);
        setOptionsState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setOptionsState("error");
      });
    return controller;
  }, []);

  useEffect(() => {
    const controller = loadOptions();
    const urls = blobUrls.current;
    return () => {
      controller.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, [loadOptions]);

  const addServerDesign = useCallback(async (file: SetPetDesignFileDto) => {
    setDesigns((list) => (list.some((d) => d.id === file.id) ? list : [...list, { id: file.id, name: file.originalFilename ?? "", previewUrl: null, status: "ready", px: file.widthPx && file.heightPx ? { w: file.widthPx, h: file.heightPx } : undefined }]));
    if (!file.previewable) return;
    const preview = await setPetService.previewDesign(file.id).catch(() => null);
    // Only a same-origin URL (our API's signed link) is ever drawn.
    if (preview && (preview.url.startsWith("/") || preview.url.startsWith(window.location.origin))) {
      setDesigns((list) => list.map((d) => (d.id === file.id ? { ...d, previewUrl: preview.url } : d)));
    }
  }, []);

  // The member's checked designs (reusable on any order), and those the current set prints.
  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController();
    setPetService.designs(controller.signal).then((files) => {
      setLibrary(files);
      const used = new Set(Object.values(s.prints).flatMap((p) => (p?.kind === "image" ? [p.designId] : [])));
      files.filter((f) => used.has(f.id)).forEach((f) => void addServerDesign(f));
    }).catch(() => undefined);
    return () => controller.abort();
    // Only on sign-in; later prints add their designs themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, addServerDesign]);

  // A signed-in member comes back to their account draft (owner P5), unless this device has a newer set.
  useEffect(() => {
    if (!signedIn || accountDraftChecked.current) return;
    accountDraftChecked.current = true;
    if (readDraft()) return;
    setPetService.draft().then(({ draft }) => {
      const restored = draft && readSnapshot(draft.data);
      if (restored) {
        setS(restored);
        setReached(BUILDER_STEPS.indexOf(restored.step));
      }
    }).catch(() => undefined);
  }, [signedIn]);

  // Designs picked before signing in come back from this device's IndexedDB.
  useEffect(() => {
    const local = readDraft();
    if (!local?.files.length) return;
    let cancelled = false;
    void readDraftFiles(local.files.map((f) => f.id)).then((found) => {
      if (cancelled || !found.size) return;
      const items: DesignItem[] = [];
      found.forEach((file, id) => {
        const name = local.files.find((f) => f.id === id)?.name ?? file.name;
        const url = isRasterPreviewable({ name, type: file.type }) ? URL.createObjectURL(file) : null;
        if (url) blobUrls.current.add(url);
        items.push({ id, name, previewUrl: url, status: "local", file });
        seq.current = Math.max(seq.current, Number(id.replace("local-", "")) || 0);
        if (url) void measureImage(url).then((px) => px && setDesigns((list) => list.map((d) => (d.id === id ? { ...d, px } : d))));
      });
      setDesigns((list) => [...list, ...items]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-save (owner P5): to the account when signed in (not while editing a sent order), else to this device.
  useEffect(() => {
    if (editOrder) return;
    const files = designs.filter((d) => d.status === "local").map((d) => ({ id: d.id, name: d.name }));
    if (!signedIn) {
      saveDraftChoices({ snapshot: s, files });
      return;
    }
    setSaved("saving");
    const timer = window.setTimeout(() => {
      const prints = Object.fromEntries(Object.entries(s.prints).filter(([, p]) => !(p?.kind === "image" && p.designId.startsWith("local-"))));
      setPetService.saveDraft({ ...s, prints }).then(() => setSaved("saved")).catch(() => setSaved("idle"));
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [s, signedIn, editOrder, designs]);

  // ---------------------------------------------------------------------------------------------- garments

  const firstHumanColour = humans[0]?.colour ?? "white";
  function setItem(key: string, patch: Partial<ItemState>) {
    update((prev) => {
      const items = prev.items.map((i) => (i.key === key ? { ...i, ...patch } : i));
      // Pet garments that follow the human colour change with the first human garment (owner P13).
      const lead = items.find((i) => !isPet(i.garment));
      return { items: items.map((i) => (isPet(i.garment) && i.colourFollowsHuman && lead ? { ...i, colour: lead.colour } : i)) };
    });
  }
  function addItem(wearer: "HUMAN" | "PET") {
    setStepError(null);
    update((prev) => ({
      items: [
        ...prev.items,
        wearer === "HUMAN"
          ? { key: newKey(), garment: "HUMAN_TEE" as const, size: "M" as const, colour: firstHumanColour as ItemState["colour"] }
          : { key: newKey(), garment: "PET_TEE" as const, size: "M" as const, colour: firstHumanColour as ItemState["colour"], petId: null, petName: "", petSpecies: "DOG" as const, colourFollowsHuman: true },
      ],
    }));
  }
  function removeItem(key: string) {
    update((prev) => ({ items: prev.items.filter((i) => i.key !== key) }));
  }

  // ---------------------------------------------------------------------------------------------- designs

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

  function updateDesign(id: string, patch: Partial<DesignItem>) {
    setDesigns((list) => list.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  /** Upload target → PUT → complete. Returns the server id, or null when the file was refused. */
  async function upload(item: DesignItem): Promise<string | null> {
    const file = item.file!;
    const tempId = item.id;
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
      updateDesign(id, { status: "ready", previewUrl: done.previewable ? item.previewUrl : null, file: undefined });
      // The print keeps its design under the new server id.
      update((prev) => ({ prints: Object.fromEntries(Object.entries(prev.prints).map(([z, p]) => [z, p?.kind === "image" && p.designId === tempId ? { ...p, designId: id } : p])) }));
      setLibrary((list) => (list.some((f) => f.id === done.id) ? list : [done, ...list]));
      return id;
    } catch (error) {
      updateDesign(id, { status: "error", error: uploadErrorText(error) });
      return null;
    }
  }

  function onFiles(event: ChangeEvent<HTMLInputElement>, forZone: SetPetZone) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setStepError(null);
    if (!file) return;
    const extension = file.name.toLowerCase().split(".").pop() ?? "";
    const tempId = `local-${++seq.current}`;
    const allowed = (options?.acceptedExtensions ?? ["jpg", "jpeg", "png", "webp", "heic", "heif", "pdf", "svg", "ai", "psd"]) as readonly string[];
    if (!allowed.includes(extension)) return setStepError(t("upload.errors.type"));
    if (file.size > (limits?.maxFileBytes ?? 50 * 1024 * 1024)) return setStepError(t("upload.errors.tooLarge", { mb: maxMb }));
    // Only the member's own JPEG/PNG/WebP is previewed, from a local blob URL, in <img>. Never an SVG or print file.
    const localUrl = isRasterPreviewable(file) ? URL.createObjectURL(file) : null;
    if (localUrl) blobUrls.current.add(localUrl);
    const item: DesignItem = { id: tempId, name: file.name, previewUrl: localUrl, status: "local", file };
    setDesigns((list) => [...list, item]);
    if (localUrl) void measureImage(localUrl).then((px) => px && updateDesign(tempId, { px }));
    setPrint(forZone, { kind: "image", designId: tempId, scale: 1, offsetX: 0, offsetY: 0 });
    if (signedIn) void upload(item);
  }

  function setPrint(z: SetPetZone, print: PrintState | null) {
    update((prev) => {
      const prints = { ...prev.prints };
      if (print) prints[z] = print;
      else delete prints[z];
      return { prints };
    });
  }

  function chooseDesign(z: SetPetZone, designId: string) {
    const file = library.find((f) => f.id === designId);
    if (file) void addServerDesign(file);
    setPrint(z, { kind: "image", designId, scale: 1, offsetX: 0, offsetY: 0 });
  }

  // ---------------------------------------------------------------------------------------------- derived

  const zonesInUse = ALL_ZONES.filter((z) => s.prints[z] && (z !== "PET_BACK" || petItems.length > 0));
  const designById = useMemo(() => new Map(designs.map((d) => [d.id, d])), [designs]);
  const previews = useMemo(() => {
    const out: Partial<Record<SetPetZone, PrintPreview>> = {};
    for (const z of ALL_ZONES) {
      const p = s.prints[z];
      if (!p) continue;
      if (p.kind === "text") out[z] = { kind: "text", text: p.text, font: p.font, colour: p.colour };
      else {
        const d = designById.get(p.designId);
        out[z] = { kind: "image", name: d?.name || t("upload.untitled"), url: d && usable(d) ? d.previewUrl : null, scale: p.scale, offsetX: p.offsetX, offsetY: p.offsetY };
      }
    }
    return out;
  }, [s.prints, designById, t]);
  const lowRes = zonesInUse.flatMap((z) => {
    const p = s.prints[z];
    const cm = ZONE_CM[z];
    if (p?.kind !== "image" || !cm) return [];
    const px = designById.get(p.designId)?.px;
    if (!px) return [];
    const dpi = printDpi(Math.min(px.w, px.h) / p.scale, cm);
    return dpi < MIN_SHARP_DPI ? [t("upload.lowRes", { zone: tz(`${z}.name`), dpi: num(dpi) })] : [];
  });
  const priceItems = s.items.map((i) => ({ garment: i.garment }));
  const range = options ? priceRangeSetPet(options.prices, priceItems, zonesInUse) : null;
  const exact = options ? priceSetPet(options.prices, priceItems, zonesInUse) : null;
  const pricesReady = !!options?.pricesReady;

  // ---------------------------------------------------------------------------------------------- steps

  function validate(target: BuilderStep): string | null {
    if (target === "garments") {
      if (!humans.length) return t("garments.errors.human");
      if (humans.length > maxHumans) return t("garments.errors.tooMany", { max: num(maxHumans) });
      if (petItems.some((i) => !i.petId && !(i.petName ?? "").trim())) return t("garments.errors.petName");
      // Owner P8: a set includes the pet; a human-only set is only in memory of a pet that is lost or has died.
      if (!petItems.length && !s.forPetId) return t("garments.errors.petRequired");
    }
    if (target === "prints") {
      if (!zonesInUse.length) return t("prints.errors.none");
      if (designs.some((d) => d.status === "uploading" || d.status === "checking")) return t("upload.errors.wait");
      const broken = zonesInUse.find((z) => {
        const p = s.prints[z];
        if (p?.kind !== "image") return false;
        const d = designById.get(p.designId);
        return !d || !usable(d);
      });
      if (broken) return t("prints.errors.design", { zone: tz(`${broken}.name`) });
    }
    return null;
  }

  function go(target: BuilderStep) {
    const from = BUILDER_STEPS.indexOf(step);
    const to = BUILDER_STEPS.indexOf(target);
    if (to > from) {
      for (const st of BUILDER_STEPS.slice(from, to)) {
        const error = validate(st);
        if (error) {
          update({ step: st });
          setStepError(error);
          requestAnimationFrame(() => errorRef.current?.focus());
          return;
        }
      }
    }
    setStepError(null);
    update({ step: target });
    setReached((r) => Math.max(r, to));
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  async function submit() {
    for (const st of BUILDER_STEPS) {
      const error = validate(st);
      if (error) {
        update({ step: st });
        setStepError(error);
        return;
      }
    }
    if (!signedIn) {
      // Keep the set on this device, then sign in and come back to send it (owner P4).
      const files = new Map<string, File>();
      designs.forEach((d) => d.status === "local" && d.file && files.set(d.id, d.file));
      await saveDraft({ snapshot: { ...s, step: "review" }, files: [...files.keys()].map((id) => ({ id, name: designById.get(id)?.name ?? "" })) }, files);
      router.push(`/${locale}/welcome?returnTo=${encodeURIComponent(`/${locale}/set-pet?resume=1#setpet-builder`)}`);
      return;
    }
    setSubmitError(null);
    const ids = new Map<string, string>();
    const usedIds = new Set(zonesInUse.flatMap((z) => (s.prints[z]?.kind === "image" ? [(s.prints[z] as { designId: string }).designId] : [])));
    const local = designs.filter((d) => d.status === "local" && usedIds.has(d.id));
    if (local.length) {
      setSubmitting("uploading");
      for (const item of local) {
        const id = await upload(item);
        if (!id) {
          setSubmitting(false);
          update({ step: "prints" });
          setStepError(t("upload.errors.someFailed"));
          return;
        }
        ids.set(item.id, id);
      }
    }
    setSubmitting("sending");
    try {
      const input = toOrderInput(s, ids);
      const order = editOrder ? await setPetService.update(editOrder.id, input) : await setPetService.create({ ...input, reorderOfId: s.reorderOfId ?? null });
      void clearDraft();
      if (!editOrder) void setPetService.deleteDraft().catch(() => undefined);
      onSubmitted(order, !!editOrder);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      const reason = error instanceof ApiError ? (error.details as { reason?: string } | undefined)?.reason : undefined;
      setSubmitError(
        code === "SET_PET_TOO_MANY_OPEN" ? t("review.errors.tooManyOpen")
        : code === "SET_PET_PRICES_NOT_SET" ? t("review.errors.prices")
        : code === "SET_PET_DESIGN_UNAVAILABLE" ? t("review.errors.designUnavailable")
        : code === "SET_PET_NOT_EDITABLE" ? t("review.errors.notEditable")
        : reason === "PET_GARMENT_REQUIRED" ? t("garments.errors.petRequired")
        : code === "VALIDATION_ERROR" ? t("review.errors.validation")
        : t("review.errors.generic"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (optionsState === "loading") return <p className="setpet-state" role="status">{t("loading")}</p>;
  if (optionsState === "error") {
    return (
      <div className="setpet-state" role="alert">
        <p>{t("loadError")}</p>
        <button type="button" className="opl-btn soft sm" onClick={() => loadOptions()}>{t("retry")}</button>
      </div>
    );
  }

  const index = BUILDER_STEPS.indexOf(step);
  const previewHuman = humans[0] ?? { garment: "HUMAN_TEE" as const, size: "M" as const, colour: "white" as const };
  const previewPet = petItems[0] ?? null;
  const selected = zone && (zone !== "PET_BACK" || petItems.length) ? zone : null;
  const current = selected ? s.prints[selected] : undefined;

  const sizeSeg = (name: string, value: SetPetSize, onChange: (v: SetPetSize) => void) => (
    <div className="setpet-seg" role="radiogroup" aria-label={t("garments.size")}>
      {SIZES.map((sz) => (
        <label key={sz} className={sz === value ? "is-on" : undefined}>
          <input type="radio" name={name} value={sz} checked={sz === value} onChange={() => onChange(sz)} />
          <span dir="ltr">{sizeLabel(sz)}</span>
        </label>
      ))}
    </div>
  );
  const colourSeg = (name: string, value: string, onChange: (v: ItemState["colour"]) => void) => (
    <div className="setpet-swatches" role="radiogroup" aria-label={t("garments.colour")}>
      {COLOURS.map((c) => (
        <label key={c.id} className={c.id === value ? "is-on" : undefined} title={tc(c.id)}>
          <input type="radio" name={name} value={c.id} checked={c.id === value} onChange={() => onChange(c.id as ItemState["colour"])} />
          <span className="setpet-swatch" style={{ background: c.hex }} aria-hidden="true" />
          <span className="sr-only">{tc(c.id)}</span>
        </label>
      ))}
    </div>
  );
  const garmentSeg = (name: string, list: readonly SetPetGarment[], value: SetPetGarment, onChange: (g: SetPetGarment) => void) => (
    <div className="setpet-seg setpet-seg--wide" role="radiogroup" aria-label={t("garments.type")}>
      {list.map((g) => (
        <label key={g} className={g === value ? "is-on" : undefined}>
          <input type="radio" name={name} value={g} checked={g === value} onChange={() => onChange(g)} />
          <span>{tg(g)}</span>
        </label>
      ))}
    </div>
  );

  return (
    <div className="setpet-builder">
      <ol className="setpet-steps" aria-label={t("stepsLabel")}>
        {BUILDER_STEPS.map((st, i) => (
          <li key={st} className={st === step ? "is-current" : i < index ? "is-done" : undefined}>
            <button type="button" onClick={() => go(st)} disabled={i > reached && i > index} aria-current={st === step ? "step" : undefined}>
              <span className="setpet-steps__n" aria-hidden="true">{i < index ? <Check size={14} /> : num(i + 1)}</span>
              <span>{t(`steps.${st}`)}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="setpet-stage has-preview">
        <section className="setpet-panel" aria-labelledby="setpet-step-title">
          <h2 id="setpet-step-title" ref={headingRef} tabIndex={-1}>{t(`${step}.title`)}</h2>
          <p className="setpet-panel__lede">{t(`${step}.lede`)}</p>

          {step === "garments" ? (
            <>
              <h3 className="setpet-sub">{t("garments.people")}</h3>
              {humans.map((item, i) => {
                const hint = hints[item.key] ?? { height: "", weight: "" };
                const tip = suggestHumanSize(parseNumber(hint.height), parseNumber(hint.weight));
                return (
                  <fieldset key={item.key} className="setpet-item">
                    <legend>{t("garments.personN", { n: num(i + 1) })}</legend>
                    {garmentSeg(`g-${item.key}`, HUMAN_GARMENTS, item.garment, (g) => setItem(item.key, { garment: g }))}
                    {sizeSeg(`s-${item.key}`, item.size, (v) => setItem(item.key, { size: v }))}
                    {colourSeg(`c-${item.key}`, item.colour, (v) => setItem(item.key, { colour: v }))}
                    <details className="setpet-hint">
                      <summary>{t("garments.suggest")}</summary>
                      <div className="setpet-hint__fields">
                        <label>{t("garments.height")}<input inputMode="decimal" value={hint.height} onChange={(e) => setHints((h) => ({ ...h, [item.key]: { ...hint, height: e.target.value } }))} /></label>
                        <label>{t("garments.weight")}<input inputMode="decimal" value={hint.weight} onChange={(e) => setHints((h) => ({ ...h, [item.key]: { ...hint, weight: e.target.value } }))} /></label>
                      </div>
                      {tip ? (
                        <p className="setpet-hint__tip">
                          {t("garments.suggested", { size: sizeLabel(tip) })}{" "}
                          {tip !== item.size ? <button type="button" className="opl-btn line sm" onClick={() => setItem(item.key, { size: tip })}>{t("garments.useSize", { size: sizeLabel(tip) })}</button> : null}
                        </p>
                      ) : null}
                      <table className="setpet-chart">
                        <caption>{t("garments.humanChart")}</caption>
                        <thead><tr><th scope="col">{t("garments.size")}</th><th scope="col">{t("garments.chestWidth")}</th><th scope="col">{t("garments.length")}</th></tr></thead>
                        <tbody>
                          {SIZES.map((sz) => (
                            <tr key={sz}><th scope="row" dir="ltr">{sizeLabel(sz)}</th><td>{num(HUMAN_CHART[sz].chestWidthCm)}</td><td>{num(HUMAN_CHART[sz].lengthCm)}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                    {humans.length > 1 ? <button type="button" className="setpet-remove" onClick={() => removeItem(item.key)}><Trash2 size={16} aria-hidden="true" />{t("garments.remove")}</button> : null}
                  </fieldset>
                );
              })}
              <button type="button" className="opl-btn soft sm" disabled={humans.length >= maxHumans} onClick={() => addItem("HUMAN")}><Plus size={16} aria-hidden="true" />{t("garments.addPerson")}</button>
              {humans.length >= maxHumans ? <p className="setpet-note">{t("garments.maxPeople", { max: num(maxHumans) })}</p> : null}

              <h3 className="setpet-sub">{t("garments.pets")}</h3>
              {petItems.map((item, i) => {
                const profilePet = pets.find((p) => p.id === item.petId);
                const mismatch = petSizeMismatch(item.size, petWeightKg(profilePet));
                return (
                  <fieldset key={item.key} className="setpet-item">
                    <legend>{t("garments.petN", { n: num(i + 1) })}</legend>
                    <label className="setpet-field">
                      <span>{t("garments.whichPet")}</span>
                      <select value={item.petId ?? ""} onChange={(e) => setItem(item.key, { petId: e.target.value || null })}>
                        <option value="">{t("garments.otherPet")}</option>
                        {activePets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </label>
                    {item.petId ? null : (
                      <div className="setpet-hint__fields">
                        <label>{t("garments.petName")}<input value={item.petName ?? ""} maxLength={40} onChange={(e) => setItem(item.key, { petName: e.target.value })} /></label>
                        <div className="setpet-seg" role="radiogroup" aria-label={t("garments.species")}>
                          {(["DOG", "CAT"] as const).map((sp) => (
                            <label key={sp} className={item.petSpecies === sp ? "is-on" : undefined}>
                              <input type="radio" name={`sp-${item.key}`} checked={item.petSpecies === sp} onChange={() => setItem(item.key, { petSpecies: sp })} />
                              <span>{t(`garments.${sp === "DOG" ? "dog" : "cat"}`)}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    {garmentSeg(`g-${item.key}`, PET_GARMENTS, item.garment, (g) => setItem(item.key, { garment: g }))}
                    {sizeSeg(`s-${item.key}`, item.size, (v) => setItem(item.key, { size: v }))}
                    {mismatch ? <p className="setpet-warn"><CircleAlert size={16} aria-hidden="true" />{t("garments.sizeMismatch")}</p> : null}
                    <details className="setpet-hint">
                      <summary>{t("garments.petGuide")}</summary>
                      <table className="setpet-chart">
                        <caption>{t("garments.petChart")}</caption>
                        <thead><tr><th scope="col">{t("garments.size")}</th><th scope="col">{t("garments.neck")}</th><th scope="col">{t("garments.chest")}</th><th scope="col">{t("garments.back")}</th></tr></thead>
                        <tbody>
                          {SIZES.map((sz) => (
                            <tr key={sz}>
                              <th scope="row" dir="ltr">{sizeLabel(sz)}</th>
                              <td>{num(PET_CHART[sz].neckCm[0])}–{num(PET_CHART[sz].neckCm[1])}</td>
                              <td>{num(PET_CHART[sz].chestCm[0])}–{num(PET_CHART[sz].chestCm[1])}</td>
                              <td>{num(PET_CHART[sz].backLengthCm[0])}–{num(PET_CHART[sz].backLengthCm[1])}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                    <label className="setpet-check">
                      <input type="checkbox" checked={!!item.colourFollowsHuman} onChange={(e) => setItem(item.key, { colourFollowsHuman: e.target.checked, ...(e.target.checked ? { colour: firstHumanColour as ItemState["colour"] } : {}) })} />
                      {t("garments.sameColour")}
                    </label>
                    {item.colourFollowsHuman ? null : colourSeg(`c-${item.key}`, item.colour, (v) => setItem(item.key, { colour: v }))}
                    <button type="button" className="setpet-remove" onClick={() => removeItem(item.key)}><Trash2 size={16} aria-hidden="true" />{t("garments.remove")}</button>
                  </fieldset>
                );
              })}
              <button type="button" className="opl-btn soft sm" disabled={petItems.length >= maxPets} onClick={() => addItem("PET")}><Plus size={16} aria-hidden="true" />{t("garments.addPet")}</button>

              {petItems.length ? null : (
                <div className="setpet-memorial">
                  <p><Info size={16} aria-hidden="true" />{t("garments.p8")}</p>
                  {memorialPets.length ? (
                    <label className="setpet-field">
                      <span>{t("garments.inMemoryOf")}</span>
                      <select value={s.forPetId ?? ""} onChange={(e) => update({ forPetId: e.target.value || null })}>
                        <option value="">{t("garments.choose")}</option>
                        {memorialPets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </label>
                  ) : (
                    <p className="setpet-note">{t("garments.noMemorial")}</p>
                  )}
                </div>
              )}
            </>
          ) : null}

          {step === "prints" ? (
            <>
              <div className="setpet-zonelist" role="list">
                {ALL_ZONES.filter((z) => z !== "PET_BACK" || petItems.length).map((z) => {
                  const p = s.prints[z];
                  const cm = ZONE_CM[z];
                  return (
                    <button key={z} type="button" role="listitem" className={`setpet-zonecard${selected === z ? " is-selected" : ""}${p ? " is-on" : ""}`} aria-pressed={selected === z} onClick={() => setZone(z)}>
                      <strong>{tz(`${z}.name`)}</strong>
                      <span>{cm ? t("prints.size", { cm: num(cm) }) : t("prints.petSize")}</span>
                      <small>{p ? (p.kind === "text" ? `«${p.text}»` : designById.get(p.designId)?.name || t("upload.untitled")) : t("prints.empty")}</small>
                    </button>
                  );
                })}
              </div>

              {selected ? (
                <div className="setpet-editor" aria-label={tz(`${selected}.name`)}>
                  <div className="setpet-tabs" role="tablist">
                    <button type="button" role="tab" aria-selected={current?.kind !== "text"} onClick={() => (current?.kind === "text" ? setPrint(selected, null) : undefined)}>{t("prints.design")}</button>
                    <button type="button" role="tab" aria-selected={current?.kind === "text"} onClick={() => setPrint(selected, { kind: "text", text: current?.kind === "text" ? current.text : "", font: "VAZIRMATN", colour: "black" })}>{t("prints.text")}</button>
                  </div>
                  {current?.kind === "text" ? (
                    <>
                      <label className="setpet-field">
                        <span>{t("prints.textLabel")}</span>
                        <input value={current.text} maxLength={40} onChange={(e) => setPrint(selected, { ...current, text: e.target.value })} />
                      </label>
                      <div className="setpet-seg setpet-seg--wide" role="radiogroup" aria-label={t("prints.font")}>
                        {(options?.fonts ?? ["VAZIRMATN", "LALEZAR", "AMIRI"]).map((f) => (
                          <label key={f} className={current.font === f ? "is-on" : undefined}>
                            <input type="radio" name={`font-${selected}`} checked={current.font === f} onChange={() => setPrint(selected, { ...current, font: f })} />
                            <span style={{ fontFamily: FONT_FAMILY[f] }}>{tf(f)}</span>
                          </label>
                        ))}
                      </div>
                      {colourSeg(`tc-${selected}`, current.colour, (v) => setPrint(selected, { ...current, colour: v }))}
                    </>
                  ) : (
                    <>
                      <label className="setpet-upload">
                        <Upload size={18} aria-hidden="true" />
                        <span>{t("upload.cta")}</span>
                        <small>{t("upload.hint", { mb: maxMb })}</small>
                        <input type="file" accept={accept} onChange={(e) => onFiles(e, selected)} />
                      </label>
                      {(() => {
                        const choices = [...designs.filter((d) => d.status !== "error"), ...library.filter((f) => !designById.has(f.id)).map((f) => ({ id: f.id, name: f.originalFilename ?? "", previewUrl: null, status: "ready" as const }))];
                        return choices.length ? (
                          <div className="setpet-library" role="radiogroup" aria-label={t("upload.yours")}>
                            {choices.map((d) => (
                              <label key={d.id} className={current?.kind === "image" && current.designId === d.id ? "is-on" : undefined}>
                                <input type="radio" name={`lib-${selected}`} checked={current?.kind === "image" && current.designId === d.id} onChange={() => chooseDesign(selected, d.id)} />
                                {d.previewUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element -- a local blob or short-lived same-origin URL of a raster file
                                  <img src={d.previewUrl} alt="" />
                                ) : (
                                  <FileText size={22} aria-hidden="true" />
                                )}
                                <span>{d.name || t("upload.untitled")}</span>
                                {d.status === "uploading" || d.status === "checking" ? <small>{t(`upload.${d.status}`)}</small> : null}
                              </label>
                            ))}
                          </div>
                        ) : null;
                      })()}
                      {designs.filter((d) => d.status === "error").map((d) => (
                        <p key={d.id} className="setpet-warn"><CircleAlert size={16} aria-hidden="true" />{d.name}: {d.error}</p>
                      ))}
                      {current?.kind === "image" ? (
                        <div className="setpet-crop">
                          <label>{t("prints.zoom")}<input type="range" min={1} max={4} step={0.05} value={current.scale} onChange={(e) => setPrint(selected, { ...current, scale: Number(e.target.value) })} /></label>
                          <label>{t("prints.moveX")}<input type="range" min={-1} max={1} step={0.02} value={current.offsetX} disabled={current.scale <= 1} onChange={(e) => setPrint(selected, { ...current, offsetX: Number(e.target.value) })} /></label>
                          <label>{t("prints.moveY")}<input type="range" min={-1} max={1} step={0.02} value={current.offsetY} disabled={current.scale <= 1} onChange={(e) => setPrint(selected, { ...current, offsetY: Number(e.target.value) })} /></label>
                          <p className="setpet-note">{t("prints.noBackground")}</p>
                        </div>
                      ) : null}
                    </>
                  )}
                  {current ? <button type="button" className="setpet-remove" onClick={() => setPrint(selected, null)}><Trash2 size={16} aria-hidden="true" />{t("prints.clear")}</button> : null}
                </div>
              ) : (
                <p className="setpet-note">{t("prints.pick")}</p>
              )}
              {lowRes.map((line) => <p key={line} className="setpet-warn"><CircleAlert size={16} aria-hidden="true" />{line}</p>)}
            </>
          ) : null}

          {step === "review" ? (
            <>
              <ul className="setpet-summary">
                {s.items.map((item) => {
                  const profilePet = pets.find((p) => p.id === item.petId);
                  const who = isPet(item.garment) ? profilePet?.name ?? item.petName ?? "" : null;
                  return (
                    <li key={item.key}>
                      <span className="setpet-swatch" style={{ background: COLOURS.find((c) => c.id === item.colour)?.hex }} aria-hidden="true" />
                      {t("review.item", { garment: tg(item.garment), size: sizeLabel(item.size), colour: tc(item.colour) })}
                      {who ? ` — ${who}` : null}
                    </li>
                  );
                })}
              </ul>
              <ul className="setpet-summary">
                {zonesInUse.map((z) => {
                  const p = s.prints[z]!;
                  return <li key={z}><strong>{tz(`${z}.name`)}:</strong> {p.kind === "text" ? `«${p.text}» (${tf(p.font)})` : designById.get(p.designId)?.name || t("upload.untitled")}</li>;
                })}
              </ul>
              {pricesReady && exact ? (
                <table className="setpet-price">
                  <tbody>
                    {exact.lines.map((line) => {
                      const item = s.items[line.position];
                      return (
                        <tr key={line.position}>
                          <th scope="row">{t("review.line", { garment: tg(line.garment), size: item ? sizeLabel(item.size) : "", zones: num(line.zones.length) })}</th>
                          <td>{money(line.lineIrr)}</td>
                        </tr>
                      );
                    })}
                    {exact.discountIrr ? <tr><th scope="row">{t("review.discount", { percent: num(exact.discountPercent) })}</th><td>−{money(exact.discountIrr)}</td></tr> : null}
                    <tr className="is-total"><th scope="row">{t("review.total")}</th><td>{money(exact.totalIrr)}</td></tr>
                  </tbody>
                </table>
              ) : (
                <p className="setpet-note" role="status">{t("review.pricesSoon")}</p>
              )}
              <ol className="setpet-next">
                <li>{t("review.next.proof")}</li>
                <li>{t("review.next.approve")}</li>
                <li>{t("review.next.pay")}</li>
                <li>{t("review.next.make", { days: num(options?.productionWorkingDays ?? 5) })}</li>
                <li>{t("review.next.ship")}</li>
              </ol>
              <label className="setpet-field">
                <span>{t("review.notes")}</span>
                <textarea rows={3} maxLength={1000} value={s.notes} onChange={(e) => update({ notes: e.target.value })} />
              </label>
              {submitError ? <p className="setpet-error" role="alert"><CircleAlert size={16} aria-hidden="true" />{submitError}</p> : null}
              <button type="button" className="opl-btn primary" disabled={!!submitting || !pricesReady} onClick={() => void submit()}>
                {submitting === "uploading" ? t("review.uploading") : submitting === "sending" ? t("review.sending") : editOrder ? t("review.saveChanges") : signedIn ? t("review.send") : t("review.signInAndSend")}
              </button>
              <p className="setpet-note">{editOrder ? t("review.editNote") : t("review.noPaymentYet")}</p>
            </>
          ) : null}

          {stepError ? <p ref={errorRef} tabIndex={-1} className="setpet-error" role="alert"><CircleAlert size={16} aria-hidden="true" />{stepError}</p> : null}

          {range && step !== "review" ? (
            <p className="setpet-range" aria-live="polite">
              {pricesReady ? t("range", { min: money(range.minIrr), max: money(range.maxIrr) }) : t("review.pricesSoon")}
            </p>
          ) : null}

          <div className="setpet-nav">
            {index > 0 ? <button type="button" className="opl-btn line sm" onClick={() => go(BUILDER_STEPS[index - 1]!)}><ChevronRight size={16} aria-hidden="true" className="setpet-nav__back" />{t("back")}</button> : <span />}
            {index < BUILDER_STEPS.length - 1 ? <button type="button" className="opl-btn primary sm" onClick={() => go(BUILDER_STEPS[index + 1]!)}>{t("next")}<ChevronLeft size={16} aria-hidden="true" className="setpet-nav__next" /></button> : null}
          </div>
          {signedIn && !editOrder ? <p className="setpet-saved" aria-live="polite">{saved === "saving" ? t("autosave.saving") : saved === "saved" ? t("autosave.saved") : ""}</p> : null}
        </section>

        <aside className="setpet-aside" aria-label={t("previewLabel")}>
          <SetPetPreview
            human={previewHuman}
            pet={previewPet}
            prints={previews}
            selectedZone={step === "prints" ? selected : null}
            onZoneClick={step === "prints" ? (z) => setZone(z) : undefined}
          />
        </aside>
      </div>
    </div>
  );
}
