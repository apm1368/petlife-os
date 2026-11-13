"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorRecovery, Skeleton } from "@petlife/ui";
import { OnboardingChapter, OnboardingStatus } from "@petlife/types";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { onboardingService } from "@/services/onboarding.service";
import { petsService } from "@/services/pets.service";
import { uploadPetPhoto } from "@/features/pets/pet-photo-upload";

type UploadState = "idle" | "uploading" | "error";

export function PetPhotoStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const t = useTranslations("onboarding.petPhoto");
  const tCommon = useTranslations("common");
  const petId = useOnboardingStore((s) => s.petId);
  const householdId = useOnboardingStore((s) => s.householdId);
  const photoUrl = useOnboardingStore((s) => s.photoUrl);
  const update = useOnboardingStore((s) => s.update);
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(photoUrl);
  const [state, setState] = useState<UploadState>("idle");
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  async function uploadFile(file: File) {
    if (!petId) return;
    setState("uploading");
    setPendingFile(file);
    setPreview(URL.createObjectURL(file));
    try {
      // uploadPetPhoto throws when the file never arrived, so onboarding never saves a photo link that is dead.
      const photoUrl = await uploadPetPhoto(petId, file);
      await petsService.update(petId, { photoUrl });
      update({ photoUrl });
      setState("idle");
    } catch {
      setState("error");
    }
  }

  async function markStepComplete() {
    await onboardingService.updateProgress({
      chapter: OnboardingChapter.PET_IDENTITY,
      step: "pet-photo",
      status: OnboardingStatus.COMPLETED,
      householdId: householdId ?? undefined,
      petId: petId ?? undefined,
    });
    onNext();
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        <p className="mt-1 text-body text-text-secondary">{t("subtitle")}</p>
      </div>

      {state === "uploading" ? (
        <Skeleton className="h-40 w-40 rounded-full" aria-label={t("uploading")} />
      ) : preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="h-40 w-40 rounded-full object-cover" />
      ) : null}

      {state === "error" ? (
        <ErrorRecovery
          title={tCommon("retry")}
          message={t("retry")}
          retryLabel={tCommon("retry")}
          onRetry={() => pendingFile && uploadFile(pendingFile)}
        />
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void uploadFile(file);
        }}
      />
      <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={!petId}>
        {t("upload")}
      </Button>

      <div className="flex gap-3">
        <Button variant="ghost" onClick={onSkip}>
          {tCommon("skip")}
        </Button>
        <Button variant="primary" className="flex-1" onClick={markStepComplete} disabled={state === "uploading"}>
          {tCommon("continue")}
        </Button>
      </div>
    </div>
  );
}
