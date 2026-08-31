"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorRecovery, Skeleton } from "@petlife/ui";
import { OnboardingChapter, OnboardingStatus } from "@petlife/types";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { onboardingService } from "@/services/onboarding.service";
import { petsService } from "@/services/pets.service";

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
      const contentType = file.type === "image/png" ? "image/png" : "image/jpeg";
      const target = await petsService.createPhotoUploadUrl(petId, contentType);
      await fetch(target.uploadUrl, { method: "PUT", body: file, headers: target.headers });
      await petsService.update(petId, { photoUrl: target.publicUrl });
      update({ photoUrl: target.publicUrl });
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
        accept="image/jpeg,image/png"
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
