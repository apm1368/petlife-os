"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import { DietType, type NutritionProfileDto } from "@petlife/types";
import { nutritionService } from "@/services/nutrition.service";

export function NutritionBasicsView({ petId }: { petId: string }) {
  const t = useTranslations("health.nutrition");
  const tCommon = useTranslations("common");
  const [profile, setProfile] = useState<NutritionProfileDto | null>(null);
  const [dietType, setDietType] = useState<DietType | "">("");
  const [currentFoodText, setCurrentFoodText] = useState("");
  const [feedingFrequencyText, setFeedingFrequencyText] = useState("");
  const [restrictionsText, setRestrictionsText] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void nutritionService.get(petId).then((data) => {
      setProfile(data);
      setDietType(data.dietType ?? "");
      setCurrentFoodText(data.currentFoodText ?? "");
      setFeedingFrequencyText(data.feedingFrequencyText ?? "");
      setRestrictionsText(data.restrictionsText ?? "");
    });
  }, [petId]);

  async function save() {
    setIsSaving(true);
    try {
      const updated = await nutritionService.upsert(petId, {
        dietType: dietType || undefined,
        currentFoodText: currentFoodText.trim() || undefined,
        feedingFrequencyText: feedingFrequencyText.trim() || undefined,
        restrictionsText: restrictionsText.trim() || undefined,
      });
      setProfile(updated);
    } finally {
      setIsSaving(false);
    }
  }

  if (!profile) return <Skeleton className="h-48 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>
      <ContextSurface className="flex flex-col gap-3">
        <Select
          label={t("dietType")}
          value={dietType}
          onChange={(e) => setDietType(e.target.value as DietType)}
          placeholder={t("dietType")}
          options={Object.values(DietType).map((value) => ({ value, label: t(`dietType_${value}`) }))}
        />
        <Input label={t("currentFood")} value={currentFoodText} onChange={(e) => setCurrentFoodText(e.target.value)} />
        <Input
          label={t("feedingFrequency")}
          value={feedingFrequencyText}
          onChange={(e) => setFeedingFrequencyText(e.target.value)}
        />
        <Input label={t("restrictions")} value={restrictionsText} onChange={(e) => setRestrictionsText(e.target.value)} />
        <Button variant="primary" isLoading={isSaving} onClick={save}>
          {tCommon("save")}
        </Button>
      </ContextSurface>
      <StatusLabel tone="neutral" className="w-fit">
        {t("shopPlaceholder")}
      </StatusLabel>
    </div>
  );
}
