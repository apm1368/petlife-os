"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, Input, Select } from "@petlife/ui";
import { SupportNeedCategory, SupportNeedUrgency } from "@petlife/types";
import { supportNeedsService } from "@/services/support-needs.service";
import { ApiError } from "@/lib/api/client";

const CATEGORIES: SupportNeedCategory[] = [
  SupportNeedCategory.FOOD,
  SupportNeedCategory.MEDICINE,
  SupportNeedCategory.VETERINARY_CARE,
  SupportNeedCategory.TEMPORARY_HOME,
  SupportNeedCategory.FOSTER,
  SupportNeedCategory.TRANSPORT,
  SupportNeedCategory.VOLUNTEER,
  SupportNeedCategory.EQUIPMENT,
  SupportNeedCategory.FINANCIAL,
  SupportNeedCategory.SHELTER_SUPPLIES,
  SupportNeedCategory.OTHER,
];

const URGENCIES: SupportNeedUrgency[] = [SupportNeedUrgency.NORMAL, SupportNeedUrgency.IMPORTANT, SupportNeedUrgency.URGENT, SupportNeedUrgency.CRITICAL];

/**
 * Publish a need. Two steps only — fill in, then preview and publish — per
 * the spec's "keep it extremely easy". Submitting sends the listing to
 * moderation (PENDING_REVIEW); it is never published straight to the board.
 */
export function CreateSupportNeedView() {
  const t = useTranslations("supportNeeds");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"FORM" | "PREVIEW">("FORM");
  const [category, setCategory] = useState<SupportNeedCategory>(SupportNeedCategory.FOOD);
  const [urgency, setUrgency] = useState<SupportNeedUrgency>(SupportNeedUrgency.NORMAL);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [province, setProvince] = useState("");
  const [city, setCity] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [neededQuantity, setNeededQuantity] = useState("");
  const [quantityUnit, setQuantityUnit] = useState("");
  const [animalType, setAnimalType] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);

  const canContinue = title.trim().length >= 3 && description.trim().length >= 10 && province.trim() !== "" && city.trim() !== "";

  async function handlePublish(): Promise<void> {
    setIsSubmitting(true);
    setError(null);
    setNeedsSignIn(false);
    try {
      const imageObjectKeys: string[] = [];
      for (const file of Array.from(fileInputRef.current?.files ?? [])) {
        const target = await supportNeedsService.requestImageUpload(file.type, file.size);
        await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: file });
        imageObjectKeys.push(target.key);
      }

      const created = await supportNeedsService.create({
        title: title.trim(),
        description: description.trim(),
        category,
        urgency,
        province: province.trim(),
        city: city.trim(),
        neighborhood: neighborhood.trim() || undefined,
        neededQuantity: neededQuantity ? Number(neededQuantity) : undefined,
        quantityUnit: quantityUnit.trim() || undefined,
        animalType: animalType.trim() || undefined,
        imageObjectKeys: imageObjectKeys.length > 0 ? imageObjectKeys : undefined,
      });
      // Publishing is a moderated step: submit for review immediately so the
      // publisher isn't left with an invisible draft they must remember to send.
      await supportNeedsService.submitForReview(created.id);
      router.push("/animal-support/needs/mine");
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) setNeedsSignIn(true);
      else setError(err instanceof ApiError ? err.message : tCommon("genericError"));
      setIsSubmitting(false);
    }
  }

  if (step === "PREVIEW") {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-page-title text-text-primary">{t("create.previewTitle")}</h1>
        <ContextSurface className="flex flex-col gap-2">
          <span className="text-body text-text-primary">{title}</span>
          <p className="text-metadata text-text-secondary">
            {t(`category.${category}`)} · {t(`urgency.${urgency}`)} · {[city, province].filter(Boolean).join(" · ")}
          </p>
          <p className="text-body text-text-primary">{description}</p>
          {neededQuantity ? <p className="text-metadata text-text-secondary">{t("create.previewQuantity", { quantity: neededQuantity, unit: quantityUnit })}</p> : null}
        </ContextSurface>
        <p className="text-metadata text-text-secondary">{t("create.moderationNotice")}</p>
        {needsSignIn ? (
          <Link href={`/login?returnTo=${encodeURIComponent("/animal-support/needs/new")}`} className="text-body text-brand-mint underline">
            {t("create.signInToPublish")}
          </Link>
        ) : null}
        {error ? <p className="text-body text-state-urgent">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" isLoading={isSubmitting} onClick={handlePublish}>
            {t("create.publish")}
          </Button>
          <Button variant="ghost" onClick={() => setStep("FORM")}>
            {t("create.back")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("create.title")}</h1>

      <ContextSurface className="flex flex-col gap-4">
        <Select label={t("create.categoryLabel")} value={category} onChange={(e) => setCategory(e.target.value as SupportNeedCategory)} options={CATEGORIES.map((value) => ({ value, label: t(`category.${value}`) }))} />
        <Select label={t("create.urgencyLabel")} value={urgency} onChange={(e) => setUrgency(e.target.value as SupportNeedUrgency)} options={URGENCIES.map((value) => ({ value, label: t(`urgency.${value}`) }))} />
        <Input label={t("create.titleLabel")} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("create.titlePlaceholder")} />
        <Input label={t("create.descriptionLabel")} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("create.descriptionPlaceholder")} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label={t("create.provinceLabel")} value={province} onChange={(e) => setProvince(e.target.value)} />
          <Input label={t("create.cityLabel")} value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <Input label={t("create.neighborhoodLabel")} hint={t("create.locationPrivacyHint")} value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label={t("create.quantityLabel")} hint={tCommon("optional")} type="number" min={1} value={neededQuantity} onChange={(e) => setNeededQuantity(e.target.value)} />
          <Input label={t("create.unitLabel")} hint={tCommon("optional")} value={quantityUnit} onChange={(e) => setQuantityUnit(e.target.value)} />
        </div>
        <Input label={t("create.animalTypeLabel")} hint={tCommon("optional")} value={animalType} onChange={(e) => setAnimalType(e.target.value)} />
        <div className="flex flex-col gap-1.5">
          <span className="text-metadata text-text-secondary">{t("create.photosLabel")}</span>
          <input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="text-body text-text-primary" />
        </div>
        <div>
          <Button variant="primary" onClick={() => setStep("PREVIEW")} disabled={!canContinue}>
            {t("create.continue")}
          </Button>
        </div>
      </ContextSurface>
    </div>
  );
}
