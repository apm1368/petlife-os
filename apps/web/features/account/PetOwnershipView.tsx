"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, ContextSurface, Dialog, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { PetOwnershipTransferDto } from "@petlife/types";
import { petOwnershipService } from "@/services/pet-ownership.service";
import { AccountPageHeader } from "./AccountNav";
import { formatAccountDate, useAccountCopy } from "./account-copy";
import { apiErrorText } from "@/lib/errors/api-error-text";

/**
 * Pet ownership (ID-01, ID-02, ID-03, ID-05).
 *
 * The screen is built around one rule the product keeps repeating: nobody takes
 * a pet without the other party's approval. So the incoming request is the most
 * prominent thing on the page, the outgoing request shows its waiting state,
 * and every action says out loud what will happen to the health record, the
 * memories and the costs before it is taken.
 */

type Tab = "incoming" | "outgoing" | "memories";

const STATUS_COPY: Record<string, { fa: string; en: string; de: string; es: string; ar: string; nl: string; tone: "neutral" | "success" | "attention" | "urgent" }> = {
  PENDING_REVIEW: { fa: "در انتظار پاسخ طرف دیگر", en: "Waiting for the other party", de: "Antwort der anderen Person ausstehend", es: "Pendiente de respuesta de la otra persona", ar: "بانتظار الطرف الآخر", nl: "Wacht op de andere partij", tone: "attention" },
  ACCEPTED: { fa: "انجام شد", en: "Completed", de: "Abgeschlossen", es: "Completado", ar: "مكتمل", nl: "Voltooid", tone: "success" },
  DECLINED: { fa: "پذیرفته نشد", en: "Declined", de: "Abgelehnt", es: "Rechazado", ar: "مرفوض", nl: "Afgewezen", tone: "neutral" },
  CANCELLED: { fa: "لغو شد", en: "Withdrawn", de: "Zurückgezogen", es: "Retirado", ar: "مسحوب", nl: "Ingetrokken", tone: "neutral" },
  EXPIRED: { fa: "مهلت تمام شد", en: "Expired", de: "Abgelaufen", es: "Caducado", ar: "منتهي الصلاحية", nl: "Verlopen", tone: "neutral" },
  DISPUTED: { fa: "اختلاف ثبت شد — مالک تغییر نکرد", en: "Disputed — ownership unchanged", de: "Streitfall — Eigentum unverändert", es: "En disputa — la titularidad no cambia", ar: "متنازع عليه — الملكية دون تغيير", nl: "Betwist — eigendom ongewijzigd", tone: "urgent" },
};

const DISPOSITION_COPY: Record<string, { fa: string; en: string; de: string; es: string; ar: string; nl: string }> = {
  TRANSFER: { fa: "خاطرات هم همراه پت منتقل می‌شود", en: "The memories move with the pet", de: "Die Erinnerungen ziehen mit dem Tier um", es: "Los recuerdos se transfieren con la mascota", ar: "تنتقل الذكريات مع الحيوان الأليف", nl: "De herinneringen gaan mee met het huisdier" },
  RETAIN: { fa: "خاطرات نزد شما می‌ماند", en: "The memories stay with you", de: "Die Erinnerungen bleiben bei Ihnen", es: "Los recuerdos se quedan contigo", ar: "تبقى الذكريات معك", nl: "De herinneringen blijven bij jou" },
  COPY_READ_ONLY: { fa: "مالک جدید یک نسخهٔ فقط‌خواندنی می‌گیرد", en: "The new owner gets a read-only copy", de: "Die neue Person erhält eine schreibgeschützte Kopie", es: "La nueva persona recibe una copia de solo lectura", ar: "يحصل المالك الجديد على نسخة للقراءة فقط", nl: "De nieuwe eigenaar krijgt een alleen-lezen kopie" },
};

export function PetOwnershipView() {
  const { t, locale, num } = useAccountCopy();
  const [tab, setTab] = useState<Tab>("incoming");
  const [incoming, setIncoming] = useState<PetOwnershipTransferDto[] | null>(null);
  const [outgoing, setOutgoing] = useState<PetOwnershipTransferDto[] | null>(null);
  const [memoryCopies, setMemoryCopies] = useState<Awaited<ReturnType<typeof petOwnershipService.listMemoryCopies>> | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [decision, setDecision] = useState<{ transfer: PetOwnershipTransferDto; action: "accept" | "decline" | "dispute" } | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [incomingList, outgoingList, copies] = await Promise.all([
        petOwnershipService.listIncoming(),
        petOwnershipService.listOutgoing(),
        petOwnershipService.listMemoryCopies(),
      ]);
      setIncoming(incomingList);
      setOutgoing(outgoingList);
      setMemoryCopies(copies);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingCount = useMemo(() => (incoming ?? []).filter((item) => item.status === "PENDING_REVIEW").length, [incoming]);

  async function act(transfer: PetOwnershipTransferDto, action: "accept" | "decline" | "cancel" | "dispute") {
    setBusy(transfer.id);
    setNotice(null);
    try {
      if (action === "accept") {
        const outcome = await petOwnershipService.acceptTransfer(transfer.id);
        setNotice(
          t(
            `«${outcome.transfer.petName}» منتقل شد. پروندهٔ سلامت همراه پت رفت و ${outcome.retainedExpenses} هزینه نزد خانوادهٔ قبلی ماند.`,
            `“${outcome.transfer.petName}” was transferred. The health record moved with the pet and ${num(outcome.retainedExpenses)} costs stayed with the previous household.`,
            `„${outcome.transfer.petName}“ wurde übertragen. Die Gesundheitsakte ist mit dem Tier umgezogen; ${num(outcome.retainedExpenses)} Kosten bleiben beim bisherigen Haushalt.`,
            `Se transfirió a «${outcome.transfer.petName}». El historial de salud se trasladó con la mascota y ${num(outcome.retainedExpenses)} gastos permanecen en el hogar anterior.`,
          ),
        );
      } else if (action === "decline") {
        await petOwnershipService.declineTransfer(transfer.id);
        setNotice(t("انتقال انجام نشد؛ مالک ثبت‌شده همان فرد قبلی باقی ماند.", "The transfer did not happen; the registered owner remains unchanged.", "Die Übertragung wurde nicht durchgeführt; die eingetragene Eigentümerperson bleibt unverändert.", "No se realizó la transferencia; la persona titular registrada no cambia.", "لم يتم النقل؛ يبقى المالك المسجَّل دون تغيير.", "De overdracht is niet doorgegaan; de geregistreerde eigenaar blijft ongewijzigd."));
      } else if (action === "cancel") {
        await petOwnershipService.cancelTransfer(transfer.id);
        setNotice(t("درخواست شما لغو شد.", "Your request was withdrawn.", "Ihre Anfrage wurde zurückgezogen.", "Retiraste tu solicitud.", "تم سحب طلبك.", "Je verzoek is ingetrokken."));
      } else {
        await petOwnershipService.raiseDispute(transfer.id);
        setNotice(
          t(
            "اختلاف ثبت شد. طبق سیاست پلتفرم، مالک ثبت‌شده تغییر نمی‌کند تا حکم مرجع رسمی یا توافق کتبی برسد.",
            "The dispute is recorded. Per policy, the registered owner does not change until an official ruling or a written agreement arrives.",
            "Der Streitfall wurde erfasst. Die eingetragene Eigentümerperson bleibt unverändert, bis eine behördliche Entscheidung oder eine schriftliche Vereinbarung vorliegt.",
            "La disputa quedó registrada. La titularidad registrada no cambia hasta que exista una resolución oficial o un acuerdo por escrito.", "تم تسجيل النزاع. وفق السياسة، لا يتغير المالك المسجَّل حتى صدور حكم رسمي أو وصول اتفاق مكتوب.", "Het geschil is vastgelegd. Volgens het beleid verandert de geregistreerde eigenaar niet tot er een officiële uitspraak of een schriftelijke overeenkomst is.",
          ),
        );
      }
      setDecision(null);
      await load();
    } catch (err) {
      setNotice(apiErrorText(err, undefined, t("انجام نشد.", "That didn't work.", "Das hat nicht funktioniert.", "No se pudo completar.", "لم ينجح ذلك.", "Dat is niet gelukt.")));
    } finally {
      setBusy(null);
    }
  }

  if (failed) {
    return (
      <ErrorRecovery
        title={t("مالکیت پت", "Pet ownership", "Tiereigentum", "Titularidad de la mascota", "ملكية الحيوان الأليف", "Eigendom van huisdier")}
        message={t("اطلاعات مالکیت بارگذاری نشد.", "Ownership didn't load.", "Die Eigentumsdaten konnten nicht geladen werden.", "No se pudo cargar la información de titularidad.", "لم يتم تحميل الملكية.", "Eigendom is niet geladen.")}
        retryLabel={t("تلاش دوباره", "Retry", "Erneut versuchen", "Reintentar", "إعادة المحاولة", "Opnieuw proberen")}
        onRetry={load}
      />
    );
  }
  if (!incoming || !outgoing || !memoryCopies) {
    return <Skeleton className="h-96 w-full" aria-label={t("در حال بارگذاری", "Loading", "Wird geladen", "Cargando", "جارٍ التحميل", "Laden")} />;
  }

  const tabs: Array<{ id: Tab; label: string; badge?: number }> = [
    { id: "incoming", label: t("دریافتی", "Incoming", "Eingehend", "Recibidas", "الواردة", "Inkomend"), badge: pendingCount },
    { id: "outgoing", label: t("ارسالی", "Outgoing", "Ausgehend", "Enviadas", "الصادرة", "Uitgaand") },
    { id: "memories", label: t("خاطرات من", "My memories", "Meine Erinnerungen", "Mis recuerdos", "ذكرياتي", "Mijn herinneringen") },
  ];

  return (
    <div className="account-stack">
      <AccountPageHeader
        eyebrow={t("خانواده", "HOUSEHOLD", "HAUSHALT", "HOGAR", "الأسرة", "HUISHOUDEN")}
        title={t("مالکیت پت", "Pet ownership", "Tiereigentum", "Titularidad de la mascota", "ملكية الحيوان الأليف", "Eigendom van huisdier")}
        description={t(
          "هر پت یک مالک اصلی دارد. انتقال مالکیت فقط با تأیید طرف دیگر انجام می‌شود.",
          "Every pet has one primary owner. A transfer only happens with the other party's approval.",
          "Jedes Tier hat genau eine hauptverantwortliche Eigentümerperson. Eine Übertragung erfolgt nur mit Zustimmung der anderen Person.",
          "Cada mascota tiene una sola persona titular principal. La transferencia solo se realiza con la aprobación de la otra persona.", "لكل حيوان أليف مالك أساسي واحد. لا يتم النقل إلا بموافقة الطرف الآخر.", "Elk huisdier heeft één hoofdeigenaar. Een overdracht gebeurt alleen met toestemming van de andere partij.",
        )}
      />

      {notice ? (
        <ContextSurface>
          <p className="text-body-sm">{notice}</p>
        </ContextSurface>
      ) : null}

      <div className="flex gap-2" role="tablist">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`rounded-full px-4 py-2 text-body-sm ${tab === item.id ? "bg-surface-inverse text-text-inverse" : "bg-surface-subtle text-text-secondary"}`}
          >
            {item.label}
            {item.badge ? <span className="ms-1.5">{item.badge}</span> : null}
          </button>
        ))}
      </div>

      {tab === "incoming" ? (
        <TransferList
          transfers={incoming}
          emptyTitle={t("درخواستی ندارید", "No requests", "Keine Anfragen", "No tienes solicitudes", "لا توجد طلبات", "Geen verzoeken")}
          emptyDescription={t("وقتی کسی مالکیت پتی را به شما پیشنهاد دهد، اینجا می‌بینید.", "When someone offers you a pet, it appears here.", "Wenn Ihnen jemand die Übernahme eines Tieres anbietet, erscheint die Anfrage hier.", "Cuando alguien te proponga asumir la titularidad de una mascota, aparecerá aquí.", "عندما يعرض عليك أحدهم حيوانًا أليفًا، سيظهر هنا.", "Als iemand je een huisdier aanbiedt, verschijnt dat hier.")}
          busyId={busy}
          role="recipient"
          onAction={act}
          onDecide={setDecision}
        />
      ) : null}

      {tab === "outgoing" ? (
        <TransferList
          transfers={outgoing}
          emptyTitle={t("پیشنهادی نداده‌اید", "No proposals", "Keine Vorschläge", "No has enviado propuestas", "لا توجد عروض", "Geen voorstellen")}
          emptyDescription={t("برای انتقال مالکیت، از صفحهٔ پت درخواست بدهید.", "To transfer a pet, start from the pet's page.", "Starten Sie die Übertragung auf der Profilseite des Tieres.", "Inicia la transferencia desde la página de la mascota.", "لنقل حيوان أليف، ابدأ من صفحته.", "Om een huisdier over te dragen, begin je op de pagina van het huisdier.")}
          busyId={busy}
          role="proposer"
          onAction={act}
          onDecide={setDecision}
        />
      ) : null}

      {tab === "memories" ? (
        memoryCopies.length ? (
          <ul className="account-stack">
            {memoryCopies.map((copy) => (
              <li key={copy.copyId}>
                <ContextSurface>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-body-sm font-medium">{copy.memory.title || copy.petName || t("خاطره", "Memory", "Erinnerung", "Recuerdo", "ذكرى", "Herinnering")}</p>
                      <p className="text-caption text-text-secondary">
                        {copy.petName ? `${copy.petName} · ` : ""}
                        {formatAccountDate(copy.memory.occurredAt, locale)}
                      </p>
                    </div>
                    <StatusLabel tone="neutral">{t("فقط‌خواندنی", "Read-only", "Schreibgeschützt", "Solo lectura", "للقراءة فقط", "Alleen-lezen")}</StatusLabel>
                  </div>
                </ContextSurface>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title={t("خاطرهٔ کپی‌شده ندارید", "No copied memories", "Keine kopierten Erinnerungen", "No tienes recuerdos copiados", "لا توجد ذكريات منسوخة", "Geen gekopieerde herinneringen")}
            description={t(
              "اگر از خانواده جدا شوید، خاطراتی که خودتان ثبت کرده‌اید به‌صورت فقط‌خواندنی نگه داشته می‌شود.",
              "If you leave a household, the memories you recorded are kept as a read-only copy.",
              "Wenn Sie einen Haushalt verlassen, bleiben die von Ihnen erstellten Erinnerungen als schreibgeschützte Kopie erhalten.",
              "Si dejas un hogar, los recuerdos que registraste se conservan como una copia de solo lectura.", "إذا غادرت أسرة، تُحفظ الذكريات التي سجّلتها كنسخة للقراءة فقط.", "Als je een huishouden verlaat, worden de herinneringen die jij hebt vastgelegd bewaard als alleen-lezen kopie.",
            )}
          />
        )
      ) : null}

      <DecisionDialog
        decision={decision}
        busy={busy !== null}
        onClose={() => setDecision(null)}
        onConfirm={(action) => {
          if (decision) void act(decision.transfer, action);
        }}
      />
    </div>
  );
}

function TransferList({
  transfers,
  emptyTitle,
  emptyDescription,
  busyId,
  role,
  onAction,
  onDecide,
}: {
  transfers: PetOwnershipTransferDto[];
  emptyTitle: string;
  emptyDescription: string;
  busyId: string | null;
  /**
   * Which side of the request this list shows. The incoming list is what the
   * recipient answers; the outgoing list is what the proposer may withdraw. The
   * API refuses the other actions, so the UI must not offer them.
   */
  role: "recipient" | "proposer";
  onAction: (transfer: PetOwnershipTransferDto, action: "accept" | "decline" | "cancel" | "dispute") => void;
  onDecide: (decision: { transfer: PetOwnershipTransferDto; action: "accept" | "decline" | "dispute" } | null) => void;
}) {
  const { t, locale } = useAccountCopy();
  if (!transfers.length) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return (
    <ul className="account-stack">
      {transfers.map((transfer) => {
        const status = STATUS_COPY[transfer.status] ?? STATUS_COPY.PENDING_REVIEW!;
        const disposition = DISPOSITION_COPY[transfer.memoryDisposition] ?? DISPOSITION_COPY.RETAIN!;
        return (
          <li key={transfer.id}>
            <ContextSurface>
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-body-sm font-medium">{transfer.petName || t("پت", "Pet", "Tier", "Mascota", "الحيوان الأليف", "Huisdier")}</p>
                    <p className="text-caption text-text-secondary">
                      {t("از", "From", "Von", "De", "من", "Van")} {transfer.fromDisplayName || "—"} · {t("به", "to", "an", "a", "إلى", "naar")} {transfer.toDisplayName || "—"}
                    </p>
                  </div>
                  <StatusLabel tone={status.tone}>{t(status.fa, status.en, status.de, status.es)}</StatusLabel>
                </div>

                <p className="text-caption text-text-secondary">
                  {t(disposition.fa, disposition.en, disposition.de, disposition.es)} ·{" "}
                  {t("مهلت پاسخ تا", "Answer by", "Antwortfrist bis", "Responder antes del", "الرد قبل", "Antwoorden vóór")} {formatAccountDate(transfer.expiresAt, locale)}
                </p>

                {transfer.status === "PENDING_REVIEW" && role === "recipient" ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={busyId === transfer.id} onClick={() => onDecide({ transfer, action: "accept" })}>
                      {t("تأیید انتقال", "Approve transfer", "Übertragung zustimmen", "Aprobar transferencia", "الموافقة على النقل", "Overdracht goedkeuren")}
                    </Button>
                    <Button size="sm" variant="secondary" disabled={busyId === transfer.id} onClick={() => onDecide({ transfer, action: "decline" })}>
                      {t("رد کردن", "Decline", "Ablehnen", "Rechazar", "رفض", "Afwijzen")}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busyId === transfer.id} onClick={() => onDecide({ transfer, action: "dispute" })}>
                      {t("ثبت اختلاف", "Report a dispute", "Streitfall melden", "Registrar una disputa", "الإبلاغ عن نزاع", "Geschil melden")}
                    </Button>
                  </div>
                ) : null}

                {transfer.status === "PENDING_REVIEW" && role === "proposer" ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" disabled={busyId === transfer.id} onClick={() => onAction(transfer, "cancel")}>
                      {t("لغو درخواست", "Withdraw request", "Anfrage zurückziehen", "Retirar solicitud", "سحب الطلب", "Verzoek intrekken")}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busyId === transfer.id} onClick={() => onDecide({ transfer, action: "dispute" })}>
                      {t("ثبت اختلاف", "Report a dispute", "Streitfall melden", "Registrar una disputa", "الإبلاغ عن نزاع", "Geschil melden")}
                    </Button>
                  </div>
                ) : null}
              </div>
            </ContextSurface>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The confirmation step. It states exactly what happens, because the cost of
 * getting this wrong is the owner losing the pet's history — so the copy names
 * the health record, the memories and the costs explicitly.
 */
function DecisionDialog({
  decision,
  busy,
  onClose,
  onConfirm,
}: {
  decision: { transfer: PetOwnershipTransferDto; action: "accept" | "decline" | "dispute" } | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (action: "accept" | "decline" | "dispute") => void;
}) {
  const { t } = useAccountCopy();
  if (!decision) return null;
  const { transfer, action } = decision;
  const disposition = DISPOSITION_COPY[transfer.memoryDisposition] ?? DISPOSITION_COPY.RETAIN!;

  const body =
    action === "accept"
      ? t(
          `با تأیید شما، «${transfer.petName}» به خانوادهٔ شما منتقل می‌شود. پروندهٔ سلامت همراه پت می‌آید. ${disposition.fa}. هزینه‌های ثبت‌شده نزد خانوادهٔ قبلی می‌ماند.`,
          `With your approval, “${transfer.petName}” moves into your household. The health record comes with it. ${disposition.en}. Recorded costs stay with the previous household.`,
          `Mit Ihrer Zustimmung wird „${transfer.petName}“ in Ihren Haushalt übertragen. Die Gesundheitsakte zieht mit dem Tier um. ${disposition.de}. Erfasste Kosten bleiben beim bisherigen Haushalt.`,
          `Al aprobar, «${transfer.petName}» pasa a tu hogar. El historial de salud se traslada con la mascota. ${disposition.es}. Los gastos registrados permanecen en el hogar anterior.`,
        )
      : action === "decline"
        ? t(
            "با رد کردن، پت دست همان مالک ثبت‌شده می‌ماند و چیزی تغییر نمی‌کند.",
            "Declining leaves the pet with the registered owner; nothing changes.",
            "Wenn Sie ablehnen, bleibt das Tier bei der eingetragenen Eigentümerperson; es ändert sich nichts.",
            "Si rechazas, la mascota permanece con la persona titular registrada; nada cambia.", "يُبقي الرفض الحيوان الأليف مع المالك المسجَّل؛ لا شيء يتغير.", "Bij afwijzen blijft het huisdier bij de geregistreerde eigenaar; er verandert niets.",
          )
        : t(
            "اختلاف ثبت می‌شود و مالک ثبت‌شده تغییر نمی‌کند تا حکم مرجع رسمی یا توافق کتبی برسد.",
            "The dispute is recorded and the registered owner stays until an official ruling or a written agreement arrives.",
            "Der Streitfall wird erfasst. Die eingetragene Eigentümerperson bleibt bestehen, bis eine behördliche Entscheidung oder schriftliche Vereinbarung vorliegt.",
            "La disputa queda registrada y la persona titular no cambia hasta que exista una resolución oficial o un acuerdo por escrito.", "يُسجَّل النزاع ويبقى المالك المسجَّل حتى صدور حكم رسمي أو وصول اتفاق مكتوب.", "Het geschil wordt vastgelegd en de geregistreerde eigenaar blijft tot er een officiële uitspraak of een schriftelijke overeenkomst is.",
          );

  return (
    <Dialog open onClose={onClose} title={action === "accept" ? t("تأیید انتقال مالکیت", "Approve the ownership transfer", "Eigentumsübertragung zustimmen", "Aprobar la transferencia de titularidad", "الموافقة على نقل الملكية", "De eigendomsoverdracht goedkeuren") : action === "decline" ? t("رد کردن انتقال", "Decline the transfer", "Übertragung ablehnen", "Rechazar la transferencia", "رفض النقل", "De overdracht afwijzen") : t("ثبت اختلاف", "Report a dispute", "Streitfall melden", "Registrar una disputa", "الإبلاغ عن نزاع", "Geschil melden")}>
      <p className="text-body-sm">{body}</p>
      <div className="mt-4 flex gap-2">
        <Button disabled={busy} onClick={() => onConfirm(action)}>
          {action === "accept" ? t("تأیید می‌کنم", "I approve", "Ich stimme zu", "Apruebo", "أوافق", "Ik keur goed") : action === "decline" ? t("رد می‌کنم", "I decline", "Ich lehne ab", "Rechazo", "أرفض", "Ik wijs af") : t("ثبت کن", "Record it", "Melden", "Registrar", "سجّله", "Vastleggen")}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          {t("انصراف", "Cancel", "Abbrechen", "Cancelar", "إلغاء", "Annuleren")}
        </Button>
      </div>
    </Dialog>
  );
}
