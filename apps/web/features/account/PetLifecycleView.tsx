"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, Dialog, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import type { PetDto } from "@petlife/types";
import { petsService } from "@/services/pets.service";
import { AccountPageHeader } from "./AccountNav";
import { useStatusText } from "@/lib/status/use-status-text";
import { useAccountCopy } from "./account-copy";

export function PetLifecycleView({ petId }: { petId: string }) {
  const { t } = useAccountCopy();
  const locale = useLocale();
  const router = useRouter();
  const statusText = useStatusText();
  const [pet, setPet] = useState<PetDto | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [action, setAction] = useState<"deceased" | "memorial" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setPet(await petsService.getById(petId));
    } catch {
      setLoadError(true);
    }
  }, [petId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirm() {
    if (!pet || !action || busy) return;
    setBusy(true);
    setActionError(false);
    try {
      const updated = action === "deceased"
        ? await petsService.markDeceased(pet.id, reason || undefined)
        : await petsService.transitionToMemorial(pet.id, reason || undefined);
      setPet(updated);
      setAction(null);
      setReason("");
    } catch {
      setActionError(true);
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <ErrorRecovery
        title={t("وضعیت زندگی بارگذاری نشد", "Lifecycle status couldn't be loaded", "Der Lebensstatus konnte nicht geladen werden", "No se pudo cargar el estado de vida", "تعذّر تحميل حالة دورة الحياة", "Levensloopstatus kon niet worden geladen")}
        message={t("اطلاعات این حیوان در دسترس نیست.", "This pet's information is unavailable.", "Die Informationen zu diesem Tier sind nicht verfügbar.", "La información de esta mascota no está disponible.", "معلومات هذا الحيوان الأليف غير متاحة.", "De gegevens van dit huisdier zijn niet beschikbaar.")}
        retryLabel={t("تلاش دوباره", "Retry", "Erneut versuchen", "Reintentar", "إعادة المحاولة", "Opnieuw proberen")}
        onRetry={() => void load()}
      />
    );
  }

  if (!pet) return <Skeleton className="h-80 w-full" aria-label={t("در حال بارگذاری", "Loading", "Wird geladen", "Cargando", "جارٍ التحميل", "Laden")} />;

  return (
    <div className="account-stack">
      <AccountPageHeader
        eyebrow={t("وضعیت زندگی حیوان", "PET LIFECYCLE", "LEBENSSTATUS DES TIERES", "ESTADO DE VIDA DE LA MASCOTA", "دورة حياة الحيوان الأليف", "LEVENSLOOP HUISDIER")}
        title={pet.name}
        description={t(
          "تغییرهای حساس با تأیید جداگانه ثبت می‌شوند و پرونده سلامت و خاطرات را از بین نمی‌برند.",
          "Sensitive changes require separate confirmation and never erase health records or memories.",
          "Sensible Änderungen brauchen eine eigene Bestätigung. Gesundheitsdaten und Erinnerungen bleiben erhalten.",
          "Los cambios delicados requieren una confirmación aparte y nunca eliminan el historial médico ni los recuerdos.", "تتطلب التغييرات الحساسة تأكيدًا منفصلًا ولا تمحو أبدًا السجلات الصحية أو الذكريات.", "Gevoelige wijzigingen vragen om een aparte bevestiging en wissen nooit gezondheidsgegevens of herinneringen.",
        )}
      />

      <ContextSurface className="lifecycle-current">
        <div>
          <p>{t("وضعیت فعلی", "Current status", "Aktueller Status", "Estado actual", "الحالة الحالية", "Huidige status")}</p>
          <h2>{statusText.label(pet.lifecycleStatus, "lifecycle")}</h2>
        </div>
        <StatusLabel tone={pet.lifecycleStatus === "ACTIVE" ? "success" : "neutral"}>{statusText.label(pet.lifecycleStatus, "lifecycle")}</StatusLabel>
      </ContextSurface>

      <section className="lifecycle-actions">
        <ContextSurface>
          <h2>{t("گم‌شدن", "Lost pet", "Vermisst", "Mascota perdida", "حيوان أليف مفقود", "Vermist huisdier")}</h2>
          <p>{t(
            "گم‌شدن یک رخداد عملیاتی با اعلان، گزارش مشاهده و پیگیری است؛ از مسیر اختصاصی انجام می‌شود.",
            "Lost pet reporting is an operational incident with alerts, sightings and follow-up.",
            "Eine Vermisstenmeldung umfasst Benachrichtigungen, Sichtungen und Nachverfolgung und wird im eigenen Ablauf bearbeitet.",
            "Un reporte de mascota perdida incluye avisos, avistamientos y seguimiento; se gestiona en su flujo específico.", "الإبلاغ عن حيوان أليف مفقود حادثة تشغيلية تشمل التنبيهات والمشاهدات والمتابعة.", "Een vermist huisdier melden is een operationeel incident met waarschuwingen, waarnemingen en opvolging.",
          )}</p>
          <Button variant="secondary" onClick={() => router.push(`/${locale}/pets/${pet.id}/lost/report`)}>{t("ورود به گزارش گم‌شدن", "Open lost pet flow", "Vermisstenmeldung öffnen", "Abrir reporte de mascota perdida", "فتح بلاغ الحيوان الأليف المفقود", "Naar vermist-melding")}</Button>
        </ContextSurface>

        <ContextSurface>
          <h2>{t("فوت و یادبود", "Deceased & memorial", "Verstorben und Erinnerung", "Fallecimiento y homenaje", "الوفاة ووضع الذكرى", "Overleden en in memoriam")}</h2>
          <p>{t(
            "وضعیت فوت یک واقعیت حساس است. حالت یادبود پس از آن و با انتخاب جداگانه فعال می‌شود.",
            "Deceased is a sensitive lifecycle fact. Memorial mode is a separate, later choice.",
            "Der Tod eines Tieres ist eine sensible Angabe. Der Erinnerungsmodus ist eine spätere, separate Entscheidung.",
            "El fallecimiento es un dato delicado. El modo de homenaje es una decisión posterior e independiente.", "الوفاة حقيقة حساسة في دورة الحياة. وضع الذكرى خيار منفصل يأتي لاحقًا.", "Overlijden is een gevoelig feit in de levensloop. De in-memoriammodus is een aparte, latere keuze.",
          )}</p>
          {pet.lifecycleStatus === "ACTIVE" || pet.lifecycleStatus === "LOST" ? (
            <Button variant="secondary" onClick={() => { setActionError(false); setAction("deceased"); }}>{t("ثبت فوت", "Mark deceased", "Als verstorben markieren", "Registrar fallecimiento", "تسجيل الوفاة", "Als overleden markeren")}</Button>
          ) : null}
          {pet.lifecycleStatus === "DECEASED" ? (
            <Button onClick={() => { setActionError(false); setAction("memorial"); }}>{t("فعال‌سازی یادبود", "Enable memorial", "Erinnerungsmodus aktivieren", "Activar homenaje", "تفعيل الذكرى", "In memoriam inschakelen")}</Button>
          ) : null}
        </ContextSurface>
      </section>

      <Dialog
        open={Boolean(action)}
        onClose={() => { if (!busy) { setAction(null); setActionError(false); } }}
        title={action === "deceased"
          ? t("تأیید ثبت فوت", "Confirm deceased status", "Tod des Tieres bestätigen", "Confirmar fallecimiento", "تأكيد حالة الوفاة", "Overlijden bevestigen")
          : t("فعال‌سازی حالت یادبود", "Enable memorial mode", "Erinnerungsmodus aktivieren", "Activar el modo de homenaje", "تفعيل وضع الذكرى", "In-memoriammodus inschakelen")}
      >
        <div className="flex flex-col gap-4">
          <p className="text-body text-text-secondary">{action === "deceased"
            ? t("پرونده پزشکی و خاطرات حفظ می‌شوند و یادآوری‌های مراقبتی باید متوقف شوند. این اقدام عادی و روزمره نیست.", "Medical records and memories remain; care nudges should stop. This is not a routine profile edit.", "Gesundheitsdaten und Erinnerungen bleiben erhalten; Pflegeerinnerungen sollten enden. Dies ist keine alltägliche Profiländerung.", "El historial médico y los recuerdos se conservan; deben detenerse los recordatorios de cuidados. No es un cambio rutinario del perfil.", "تبقى السجلات الطبية والذكريات؛ ويجب أن تتوقف تنبيهات الرعاية. هذا ليس تعديلًا روتينيًا للملف.", "Medische gegevens en herinneringen blijven bewaard; zorgmeldingen horen te stoppen. Dit is geen gewone profielwijziging.")
            : t("حالت یادبود هویت و خاطرات را حفظ می‌کند و مالکیت دائمی را تغییر نمی‌دهد.", "Memorial mode preserves identity and memories and does not change ownership.", "Der Erinnerungsmodus bewahrt Identität und Erinnerungen und ändert nicht die dauerhafte Eigentümerschaft.", "El modo de homenaje conserva la identidad y los recuerdos, y no cambia la titularidad permanente.", "يحافظ وضع الذكرى على الهوية والذكريات ولا يغيّر الملكية.", "De in-memoriammodus bewaart identiteit en herinneringen en verandert het eigendom niet.")}</p>
          <Input label={t("یادداشت اختیاری", "Optional note", "Optionale Notiz", "Nota opcional", "ملاحظة اختيارية", "Optionele notitie")} value={reason} onChange={(event) => setReason(event.target.value)} />
          {actionError ? <p role="alert">{t("ثبت تغییر انجام نشد. دوباره تلاش کنید.", "The change couldn't be saved. Please try again.", "Die Änderung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.", "No se pudo guardar el cambio. Inténtalo de nuevo.", "تعذّر حفظ التغيير. يُرجى المحاولة مرة أخرى.", "De wijziging kon niet worden opgeslagen. Probeer het opnieuw.")}</p> : null}
          <div className="flex gap-2">
            <Button variant={action === "deceased" ? "danger" : "primary"} isLoading={busy} onClick={() => void confirm()}>{t("تأیید نهایی", "Confirm", "Bestätigen", "Confirmar", "تأكيد", "Bevestigen")}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => { setAction(null); setActionError(false); }}>{t("انصراف", "Cancel", "Abbrechen", "Cancelar", "إلغاء", "Annuleren")}</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
