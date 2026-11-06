"use client";
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, Dialog, Input, Skeleton, StatusLabel } from "@petlife/ui";
import type { PetDto } from "@petlife/types";
import { petsService } from "@/services/pets.service";
import { AccountPageHeader } from "./AccountNav";
import { useStatusText } from "@/lib/status/use-status-text";
import { ApiError } from "@/lib/api/client";

export function PetLifecycleView({ petId }: { petId: string }) {
  const statusText = useStatusText();
  const locale = useLocale();
  const router = useRouter();
  const [pet, setPet] = useState<PetDto | null>(null);
  const [action, setAction] = useState<"deceased" | "memorial" | "correct" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [correctionWindowExpired, setCorrectionWindowExpired] = useState(false);
  useEffect(() => {
    void petsService.getById(petId).then(setPet);
  }, [petId]);
  async function confirm() {
    if (!pet || !action) return;
    setBusy(true);
    setFailed(false);
    setCorrectionWindowExpired(false);
    try {
      const updated =
        action === "deceased"
          ? await petsService.markDeceased(pet.id, reason || undefined)
          : action === "memorial"
            ? await petsService.transitionToMemorial(pet.id, reason || undefined)
            : await petsService.correctLifecycleToActive(pet.id, reason.trim());
      setPet(updated);
      setAction(null);
      setReason("");
    } catch (error) {
      setFailed(true);
      setCorrectionWindowExpired(
        action === "correct" &&
          error instanceof ApiError &&
          error.code === "PET_LIFECYCLE_CORRECTION_WINDOW_EXPIRED",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!pet)
    return <Skeleton className="h-80 w-full" aria-label={locale === "fa" ? "در حال بارگذاری" : "Loading"} />;
  return (
    <div className="account-stack">
      <AccountPageHeader
        eyebrow={locale === "fa" ? "وضعیت زندگی" : "opetlifeCYCLE"}
        title={pet.name}
        description={
          locale === "fa"
            ? "تغییرهای حساس با تأیید جداگانه ثبت می‌شوند و پرونده سلامت و خاطرات را از بین نمی‌برند."
            : "Sensitive changes require separate confirmation and never erase health records or memories."
        }
      />
      <ContextSurface className="lifecycle-current">
        <div>
          <p>{locale === "fa" ? "وضعیت فعلی" : "Current status"}</p>
          <h2>{statusText.label(pet.lifecycleStatus, "lifecycle")}</h2>
        </div>
        <StatusLabel tone={pet.lifecycleStatus === "ACTIVE" ? "success" : "neutral"}>
          {statusText.label(pet.lifecycleStatus, "lifecycle")}
        </StatusLabel>
      </ContextSurface>
      <section className="lifecycle-actions">
        <ContextSurface>
          <h2>{locale === "fa" ? "گم‌شدن" : "Lost pet"}</h2>
          <p>
            {locale === "fa"
              ? "گم‌شدن یک رخداد عملیاتی با اعلان، گزارش مشاهده و پیگیری است؛ از مسیر اختصاصی انجام می‌شود."
              : "Lost pet reporting is an operational incident with alerts, sightings and follow-up."}
          </p>
          <Button variant="secondary" onClick={() => router.push(`/${locale}/pets/${pet.id}/lost/report`)}>
            {locale === "fa" ? "ورود به گزارش گم‌شدن" : "Open lost pet flow"}
          </Button>
        </ContextSurface>
        <ContextSurface>
          <h2>{locale === "fa" ? "فوت و یادبود" : "Deceased & memorial"}</h2>
          <p>
            {locale === "fa"
              ? "وضعیت فوت یک واقعیت حساس است. حالت یادبود پس از آن و با انتخاب جداگانه فعال می‌شود."
              : "Deceased is a sensitive lifecycle fact. Memorial mode is a separate, later choice."}
          </p>
          {pet.lifecycleStatus === "ACTIVE" || pet.lifecycleStatus === "LOST" ? (
            <Button variant="secondary" onClick={() => setAction("deceased")}>
              {locale === "fa" ? "ثبت فوت" : "Mark deceased"}
            </Button>
          ) : null}
          {pet.lifecycleStatus === "DECEASED" ? (
            <Button onClick={() => setAction("memorial")}>
              {locale === "fa" ? "فعال‌سازی یادبود" : "Enable memorial"}
            </Button>
          ) : null}
          {pet.lifecycleStatus === "LOST" || pet.lifecycleStatus === "DECEASED" ? (
            <Button
              variant="ghost"
              onClick={() => {
                setFailed(false);
                setCorrectionWindowExpired(false);
                setAction("correct");
              }}
            >
              {locale === "fa" ? "اصلاح ثبت اشتباه" : "Correct an accidental status"}
            </Button>
          ) : null}
        </ContextSurface>
      </section>
      <Dialog
        open={Boolean(action)}
        onClose={() => setAction(null)}
        title={
          action === "deceased"
            ? locale === "fa"
              ? "تأیید ثبت فوت"
              : "Confirm deceased status"
            : action === "correct"
              ? locale === "fa"
                ? "اصلاح وضعیت ثبت‌شده"
                : "Correct recorded status"
              : locale === "fa"
                ? "فعال‌سازی حالت یادبود"
                : "Enable memorial mode"
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-body text-text-secondary">
            {action === "deceased"
              ? locale === "fa"
                ? "پرونده پزشکی و خاطرات حفظ می‌شوند و یادآوری‌های مراقبتی باید متوقف شوند. این اقدام عادی و روزمره نیست."
                : "Medical records and memories remain; care nudges should stop. This is not a routine profile edit."
              : action === "correct"
                ? locale === "fa"
                  ? "فقط مالک خانواده، تا ۷ روز پس از ثبت گم‌شدن یا فوت، می‌تواند خطای ثبت را با دلیل اصلاح کند. تاریخچهٔ قبلی حذف نمی‌شود."
                  : "Only a household owner may correct an accidental lost or deceased status within seven days. The earlier record remains in the history."
                : locale === "fa"
                  ? "حالت یادبود هویت و خاطرات را حفظ می‌کند و مالکیت دائمی را تغییر نمی‌دهد."
                  : "Memorial mode preserves identity and memories and does not change ownership."}
          </p>
          <Input
            label={
              action === "correct"
                ? locale === "fa"
                  ? "دلیل اصلاح"
                  : "Reason for correction"
                : locale === "fa"
                  ? "یادداشت اختیاری"
                  : "Optional note"
            }
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {failed ? (
            <div role="alert" className="flex flex-col gap-2">
              <p>
                {correctionWindowExpired
                  ? locale === "fa"
                    ? "مهلت اصلاح مستقیم تمام شده است. درخواست شما باید از مسیر پشتیبانی بررسی شود."
                    : "The self-service correction window has ended. Support must review this request."
                  : locale === "fa"
                    ? "اصلاح انجام نشد. فقط مالک و در بازهٔ مجاز می‌تواند این تغییر را ثبت کند."
                    : "The correction could not be completed. It requires a household owner and an active correction window."}
              </p>
              {correctionWindowExpired ? (
                <Button variant="secondary" onClick={() => router.push(`/${locale}/support/new`)}>
                  {locale === "fa" ? "درخواست پشتیبانی" : "Contact support"}
                </Button>
              ) : null}
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button
              variant={action === "deceased" ? "danger" : "primary"}
              isLoading={busy}
              disabled={action === "correct" && reason.trim().length < 3}
              onClick={confirm}
            >
              {locale === "fa" ? "تأیید نهایی" : "Confirm"}
            </Button>
            <Button variant="ghost" onClick={() => setAction(null)}>
              {locale === "fa" ? "انصراف" : "Cancel"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
