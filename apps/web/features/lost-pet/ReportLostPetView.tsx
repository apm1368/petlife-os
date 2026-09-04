"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, Input, Select } from "@petlife/ui";
import { lostPetService } from "@/services/lost-pet.service";
import { ApiError } from "@/lib/api/client";

/**
 * spec: "urgent but controlled... avoid panic-red everywhere" — this form
 * itself stays calm (no alarming color), while the resulting incident's own
 * status labels carry the urgency once created.
 */
export function ReportLostPetView({ petId }: { petId: string }) {
  const t = useTranslations("lostPet");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [description, setDescription] = useState("");
  const [lastKnownLocation, setLastKnownLocation] = useState("");
  const [lastSeenAt, setLastSeenAt] = useState("");
  const [contactPreference, setContactPreference] = useState<"IN_APP_MESSAGE" | "MASKED_CONTACT" | "PUBLIC_CONTACT">("IN_APP_MESSAGE");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(): Promise<void> {
    if (!description.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      let primaryPhotoObjectKey: string | undefined;
      const file = fileInputRef.current?.files?.[0];
      if (file) {
        const target = await lostPetService.requestPhotoUpload(petId, file.type, file.size);
        await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: file });
        primaryPhotoObjectKey = target.key;
      }
      const incident = await lostPetService.open(petId, {
        description: description.trim(),
        lastKnownLocation: lastKnownLocation.trim() || undefined,
        lastSeenAt: lastSeenAt || undefined,
        contactPreference,
        primaryPhotoObjectKey,
      });
      router.push(`/pets/${petId}/lost/${incident.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("report.title")}</h1>
      <p className="text-body text-text-secondary">{t("report.subtitle")}</p>

      <ContextSurface className="flex flex-col gap-4">
        <Input label={t("report.descriptionLabel")} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("report.descriptionPlaceholder")} />
        <Input label={t("report.lastKnownLocationLabel")} value={lastKnownLocation} onChange={(e) => setLastKnownLocation(e.target.value)} />
        <Input label={t("report.lastSeenAtLabel")} type="datetime-local" value={lastSeenAt} onChange={(e) => setLastSeenAt(e.target.value)} />
        <Select
          label={t("report.contactPreferenceLabel")}
          value={contactPreference}
          onChange={(e) => setContactPreference(e.target.value as typeof contactPreference)}
          options={[
            { value: "IN_APP_MESSAGE", label: t("report.contactPreference.inAppMessage") },
            { value: "MASKED_CONTACT", label: t("report.contactPreference.maskedContact") },
            { value: "PUBLIC_CONTACT", label: t("report.contactPreference.publicContact") },
          ]}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-metadata text-text-secondary">{t("report.photoLabel")}</span>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="text-body text-text-primary" />
        </div>
        {error ? <p className="text-body text-state-urgent">{error}</p> : null}
        <Button variant="primary" isLoading={isSubmitting} onClick={handleSubmit} disabled={!description.trim()}>
          {t("report.submit")}
        </Button>
      </ContextSurface>
    </div>
  );
}
