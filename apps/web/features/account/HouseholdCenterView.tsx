"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Avatar,
  Button,
  ContextSurface,
  Dialog,
  EmptyState,
  ErrorRecovery,
  Input,
  Select,
  Skeleton,
  StatusLabel,
} from "@petlife/ui";
import type { HouseholdDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { householdsService } from "@/services/households.service";
import type { HouseholdCollaborationDto } from "@/services/account.service";
import { useSessionStore } from "@/stores/session-store";
import { AccountPageHeader } from "./AccountNav";
import { HouseholdNameEditor } from "./HouseholdNameEditor";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { formatAccountDate, useAccountCopy } from "./account-copy";
import { normalizeIranPhone } from "@petlife/validation";
import { ShareBar } from "@/features/shared/ShareBar";

type Preset = "NONE" | "VIEW_ONLY" | "CARE_HELPER" | "FULL";
type Member = HouseholdCollaborationDto["members"][number];
type PendingConfirm =
  | { kind: "remove"; member: Member }
  | { kind: "demote"; member: Member }
  | { kind: "promote"; member: Member }
  | { kind: "leave" }
  | null;

/** Plain-language summary of each invite preset — mirrors the exact flags the API grants (households.service PRESETS). */
const PRESET_COPY: Record<
  Preset,
  {
    fa: string;
    en: string;
    de: string;
    es: string;
    faHint: string;
    enHint: string;
    deHint: string;
    esHint: string;
  }
> = {
  NONE: {
    fa: "بدون دسترسی",
    en: "No access",
    de: "Kein Zugriff",
    es: "Sin acceso",
    faHint: "این حیوان به او نشان داده نمی‌شود.",
    enHint: "This pet isn't shared with them.",
    deHint: "Dieses Tier wird nicht mit der Person geteilt.",
    esHint: "Esta mascota no se comparte con esta persona.",
  },
  VIEW_ONLY: {
    fa: "فقط مشاهده",
    en: "View only",
    de: "Nur ansehen",
    es: "Solo lectura",
    faHint: "هویت و پروفایل مراقبت را می‌بیند؛ سلامت و موقعیت را نه.",
    enHint: "Sees identity and care profile; not health or location.",
    deHint: "Sieht Identität und Pflegeprofil, aber keine Gesundheits- oder Standortdaten.",
    esHint: "Puede ver la identidad y el perfil de cuidados, pero no la salud ni la ubicación.",
  },
  CARE_HELPER: {
    fa: "همیار مراقبت",
    en: "Care helper",
    de: "Pflegehilfe",
    es: "Ayudante de cuidados",
    faHint: "سلامت را می‌بیند، پروفایل مراقبت را ویرایش و رزرو می‌کند.",
    enHint: "Sees health, edits the care profile and can book care.",
    deHint: "Sieht Gesundheitsdaten, kann das Pflegeprofil bearbeiten und Termine buchen.",
    esHint: "Puede ver la salud, editar el perfil de cuidados y reservar servicios.",
  },
  FULL: {
    fa: "دسترسی کامل خانوادگی",
    en: "Full household access",
    de: "Voller Haushaltszugriff",
    es: "Acceso completo al hogar",
    faHint: "همه‌چیز به‌جز مدیریت دسترسی دیگران.",
    enHint: "Everything except managing other people's access.",
    deHint: "Alles außer der Verwaltung der Zugriffsrechte anderer Personen.",
    esHint: "Todo excepto administrar el acceso de otras personas.",
  },
};

const HISTORY_LABELS: Record<string, [string, string, string, string]> = {
  HouseholdInvitationCreated: [
    "دعوت ارسال شد",
    "Invitation sent",
    "Einladung gesendet",
    "Invitación enviada",
  ],
  HouseholdInvitationResent: [
    "دعوت دوباره ارسال شد",
    "Invitation resent",
    "Einladung erneut gesendet",
    "Invitación reenviada",
  ],
  HouseholdInvitationCancelled: [
    "دعوت لغو شد",
    "Invitation cancelled",
    "Einladung storniert",
    "Invitación cancelada",
  ],
  HouseholdInvitationAccepted: [
    "دعوت پذیرفته شد",
    "Invitation accepted",
    "Einladung angenommen",
    "Invitación aceptada",
  ],
  HouseholdInvitationDeclined: [
    "دعوت رد شد",
    "Invitation declined",
    "Einladung abgelehnt",
    "Invitación rechazada",
  ],
  HouseholdMembershipRequested: [
    "درخواست عضویت ثبت شد",
    "Membership requested",
    "Mitgliedschaft angefragt",
    "Solicitud de adhesión enviada",
  ],
  HouseholdMembershipApproved: [
    "عضویت تأیید شد",
    "Membership approved",
    "Mitgliedschaft bestätigt",
    "Solicitud de adhesión aprobada",
  ],
  HouseholdMembershipRejected: [
    "درخواست عضویت رد شد",
    "Membership request rejected",
    "Mitgliedschaftsanfrage abgelehnt",
    "Solicitud de adhesión rechazada",
  ],
  PetAccessGranted: ["دسترسی داده شد", "Access granted", "Zugriff gewährt", "Acceso concedido"],
  PetAccessChanged: ["دسترسی تغییر کرد", "Access changed", "Zugriff geändert", "Acceso modificado"],
  PetAccessRevoked: ["دسترسی لغو شد", "Access revoked", "Zugriff entzogen", "Acceso revocado"],
  TemporaryPetAccessExpired: [
    "دسترسی موقت پایان یافت",
    "Temporary access ended",
    "Temporärer Zugriff beendet",
    "Acceso temporal finalizado",
  ],
  HouseholdMemberRemoved: [
    "عضوی حذف شد",
    "A member was removed",
    "Ein Mitglied wurde entfernt",
    "Se eliminó a un miembro",
  ],
  HouseholdMemberLeft: [
    "عضوی خانواده را ترک کرد",
    "A member left",
    "Ein Mitglied hat den Haushalt verlassen",
    "Un miembro salió del hogar",
  ],
  HouseholdMemberRoleChanged: [
    "نقش یک عضو تغییر کرد",
    "A member's role changed",
    "Mitgliedsrolle geändert",
    "Rol de un miembro modificado",
  ],
};

function isActive(grant: { startsAt: string | null; expiresAt: string | null }, now: number) {
  return (
    (!grant.startsAt || new Date(grant.startsAt).getTime() <= now) &&
    (!grant.expiresAt || new Date(grant.expiresAt).getTime() > now)
  );
}

/**
 * Household & access. Membership and pet permissions are shown side by side
 * but stay separate: a member's role says who manages the household, each
 * pet's grants say what they can see and do.
 */
export function HouseholdCenterView() {
  const { t, locale, num } = useAccountCopy();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUserId = useSessionStore((s) => s.user?.id);
  const [households, setHouseholds] = useState<HouseholdDto[] | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [data, setData] = useState<HouseholdCollaborationDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [resentInvite, setResentInvite] = useState<{ url: string; text: string } | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm>(null);
  const [busyInvitation, setBusyInvitation] = useState<string | null>(null);
  const detailRequestSequence = useRef(0);

  const loadList = useCallback(async () => {
    setFailed(false);
    try {
      const list = await householdsService.listMine();
      setHouseholds(list);
      setSelectedId((current) => (list.some((h) => h.id === current) ? current : (list[0]?.id ?? "")));
    } catch {
      setFailed(true);
    }
  }, []);

  const loadDetail = useCallback(async () => {
    if (!selectedId) {
      detailRequestSequence.current += 1;
      setData(null);
      return;
    }
    const request = ++detailRequestSequence.current;
    setFailed(false);
    try {
      const detail = await householdsService.collaboration(selectedId);
      if (request === detailRequestSequence.current) setData(detail);
    } catch {
      if (request === detailRequestSequence.current) setFailed(true);
    }
  }, [selectedId]);

  useEffect(() => {
    void loadList();
  }, [loadList]);
  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);
  useEffect(() => {
    if (searchParams.get("invite") === "1") setInviteOpen(true);
  }, [searchParams]);

  const accessByMember = useMemo(() => {
    const map = new Map<string, { pets: string[]; temporary: number }>();
    if (!data) return map;
    const now = Date.now();
    for (const member of data.members) {
      const grants = data.grants.filter((g) => g.userId === member.userId && isActive(g, now));
      const pets = data.pets.filter((pet) => grants.some((g) => g.petId === pet.id)).map((pet) => pet.name);
      map.set(member.userId, { pets, temporary: grants.filter((g) => g.source === "TEMPORARY").length });
    }
    return map;
  }, [data]);

  if (failed)
    return (
      <ErrorRecovery
        title={t("خانواده و دسترسی", "Household & access", "Haushalt und Zugriff", "Hogar y acceso")}
        message={t(
          "اطلاعات خانواده بارگذاری نشد.",
          "Your household didn't load.",
          "Der Haushalt konnte nicht geladen werden.",
          "No se pudo cargar el hogar.",
        )}
        retryLabel={t("تلاش دوباره", "Retry", "Erneut versuchen", "Reintentar")}
        onRetry={() => (households ? loadDetail() : loadList())}
      />
    );
  if (!households)
    return (
      <Skeleton
        className="h-96 w-full"
        aria-label={t("در حال بارگذاری", "Loading", "Wird geladen", "Cargando")}
      />
    );

  if (!households.length) {
    return (
      <div className="account-stack">
        <AccountPageHeader
          eyebrow={t("خانواده", "HOUSEHOLD", "HAUSHALT", "HOGAR")}
          title={t(
            "همکاری امن برای مراقبت",
            "Care together, securely",
            "Gemeinsam sicher für Tiere sorgen",
            "Cuidados compartidos y seguros",
          )}
          description={t(
            "هر فرد حساب خودش را دارد و دسترسی هر حیوان جداگانه تعیین می‌شود.",
            "Everyone keeps their own account and each pet's access is explicit.",
            "Jede Person behält ihr eigenes Konto; der Zugriff auf jedes Tier wird einzeln festgelegt.",
            "Cada persona conserva su cuenta y el acceso a cada mascota se define por separado.",
          )}
        />
        <EmptyState
          title={t(
            "هنوز خانواده‌ای ندارید",
            "No household yet",
            "Noch kein Haushalt",
            "Aún no tienes un hogar",
          )}
          description={t(
            "خانهٔ شما هنگام افزودن اولین حیوان ساخته می‌شود.",
            "Your household is created when you add your first pet.",
            "Ihr Haushalt wird angelegt, sobald Sie Ihr erstes Tier hinzufügen.",
            "Tu hogar se crea cuando añades tu primera mascota.",
          )}
          actionLabel={t("شروع راه‌اندازی", "Start setup", "Einrichtung starten", "Iniciar configuración")}
          onAction={() => router.push(`/${locale}/onboarding`)}
        />
      </div>
    );
  }
  // A household switch must never leave the previous household's members,
  // pet grants, or history visible under the newly selected context.
  if (!selectedId || !data || data.id !== selectedId)
    return (
      <Skeleton
        className="h-96 w-full"
        aria-label={t("در حال بارگذاری", "Loading", "Wird geladen", "Cargando")}
      />
    );

  const isOwner = data.currentUserRole === "OWNER";
  const ownerCount = data.members.filter((m) => m.role === "OWNER").length;
  const householdName = data.name || t("خانهٔ من", "My household", "Mein Haushalt", "Mi hogar");

  async function invitationAction(id: string, action: "resend" | "cancel" | "approve" | "reject") {
    if (!data) return;
    setBusyInvitation(id);
    setNotice(null);
    try {
      if (action === "resend") {
        const result = await householdsService.resendInvitation(data.id, id);
        const inviteUrl = new URL(`/${locale}${result.sharePath}`, window.location.origin).toString();
        setResentInvite({
          url: inviteUrl,
          text: t(
            "برای پیوستن به خانوادهٔ من در اپت‌لایف، این پیوند را باز کنید.",
            "Join my family on opetlife by opening this link.",
            "Öffne diesen Link, um meiner Familie auf opetlife beizutreten.",
            "Abre este enlace para unirte a mi hogar en opetlife.",
          ),
        });
      } else if (action === "approve") {
        await householdsService.approveMembershipRequest(data.id, id);
      } else if (action === "reject") {
        await householdsService.rejectMembershipRequest(data.id, id);
      } else await householdsService.cancelInvitation(data.id, id);
      setNotice(
        action === "resend"
          ? t(
              "پیوند تازه ساخته شد؛ آن را شخصاً برای فرد بفرستید.",
              "A fresh link is ready; share it directly with the person.",
              "Ein neuer Link ist bereit. Senden Sie ihn direkt an die Person.",
              "Hay un enlace nuevo. Compártelo directamente con la persona.",
            )
          : action === "approve"
            ? t(
                "درخواست تأیید شد و فقط دسترسی‌های انتخاب‌شده فعال شدند.",
                "The request was approved; only the selected access is now active.",
                "Die Anfrage wurde bestätigt; nur die ausgewählten Zugriffe sind jetzt aktiv.",
                "La solicitud fue aprobada; solo se activaron los permisos seleccionados.",
              )
            : action === "reject"
              ? t(
                  "درخواست عضویت رد شد.",
                  "The membership request was rejected.",
                  "Die Mitgliedschaftsanfrage wurde abgelehnt.",
                  "La solicitud de adhesión fue rechazada.",
                )
              : t(
                  "دعوت یا درخواست عضویت لغو شد.",
                  "The invitation or membership request was revoked.",
                  "Die Einladung oder Mitgliedschaftsanfrage wurde widerrufen.",
                  "La invitación o solicitud de adhesión fue revocada.",
                ),
      );
      await loadDetail();
    } catch {
      setNotice(
        t(
          "انجام نشد. دوباره تلاش کنید.",
          "That didn't work. Please try again.",
          "Die Aktion ist fehlgeschlagen. Bitte versuchen Sie es erneut.",
          "No se pudo completar. Inténtalo de nuevo.",
        ),
      );
    } finally {
      setBusyInvitation(null);
    }
  }

  return (
    <div className="account-stack">
      <AccountPageHeader
        eyebrow={t("خانواده و دسترسی", "HOUSEHOLD & ACCESS", "HAUSHALT UND ZUGRIFF", "HOGAR Y ACCESO")}
        title={householdName}
        description={t(
          "عضویت در خانواده به معنی دسترسی کامل به اطلاعات حیوان نیست؛ هر دسترسی جداگانه، شفاف و قابل لغو است.",
          "Being in a household never means automatic full pet access; every grant is separate, visible and reversible.",
          "Die Haushaltsmitgliedschaft gewährt keinen automatischen Vollzugriff auf Tierdaten. Jede Berechtigung ist separat, sichtbar und widerrufbar.",
          "Ser miembro del hogar no da acceso automático a todos los datos de las mascotas. Cada permiso es independiente, visible y revocable.",
        )}
      />
      {isOwner ? (
        <HouseholdNameEditor
          key={data.id + householdName}
          id={data.id}
          name={householdName}
          onSaved={async () => {
            await loadList();
            await loadDetail();
          }}
        />
      ) : null}
      {notice ? (
        <div className="account-notice" role="status">
          {notice}
        </div>
      ) : null}
      {households.length > 1 ? (
        <Select
          label={t("خانواده", "Household", "Haushalt", "Hogar")}
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          options={households.map((h) => ({
            value: h.id,
            label:
              h.name || t("خانهٔ بدون نام", "Unnamed household", "Unbenannter Haushalt", "Hogar sin nombre"),
          }))}
        />
      ) : null}

      <section aria-labelledby="members-title">
        <div className="account-section-title">
          <div>
            <h2 id="members-title">{t("اعضا", "Members", "Mitglieder", "Miembros")}</h2>
            <p>
              {t(
                "مدیران، خانواده و دعوت‌ها را مدیریت می‌کنند؛ اعضا فقط به حیوان‌هایی که با آن‌ها به اشتراک گذاشته شده دسترسی دارند.",
                "Owners manage the household and invitations; members only reach the pets shared with them.",
                "Eigentümer verwalten Haushalt und Einladungen. Mitglieder sehen nur die ausdrücklich mit ihnen geteilten Tiere.",
                "Los propietarios administran el hogar y las invitaciones. Los miembros solo acceden a las mascotas compartidas con ellos.",
              )}
            </p>
          </div>
          {isOwner ? (
            <Button onClick={() => setInviteOpen(true)}>
              {t("دعوت عضو", "Invite member", "Mitglied einladen", "Invitar a un miembro")}
            </Button>
          ) : null}
        </div>
        <div className="member-list">
          {data.members.map((member) => {
            const access = accessByMember.get(member.userId);
            const isSelf = member.userId === currentUserId;
            return (
              <div className="member-row member-row--actions" key={member.id}>
                <Avatar name={member.user.displayName} src={member.user.avatarUrl} size="sm" />
                <div>
                  <b>
                    {member.user.displayName}
                    {isSelf ? (
                      <span className="text-text-secondary"> · {t("شما", "you", "Sie", "tú")}</span>
                    ) : null}
                  </b>
                  <p>
                    {access?.pets.length
                      ? t(
                          `دسترسی به ${access.pets.join("، ")}`,
                          `Access to ${access.pets.join(", ")}`,
                          `Zugriff auf ${access.pets.join(", ")}`,
                          `Acceso a ${access.pets.join(", ")}`,
                        )
                      : t(
                          "بدون دسترسی فعال به حیوان",
                          "No active pet access",
                          "Kein aktiver Tierzugriff",
                          "Sin acceso activo a mascotas",
                        )}
                    {access?.temporary
                      ? ` · ${t(`${num(access.temporary)} دسترسی موقت`, `${num(access.temporary)} temporary`, `${num(access.temporary)} befristet`, `${num(access.temporary)} temporal`)}`
                      : ""}
                  </p>
                  <p className="text-metadata text-text-secondary">
                    {t("عضو از", "Joined", "Mitglied seit", "Se unió el")}{" "}
                    {formatAccountDate(member.createdAt, locale)}
                  </p>
                </div>
                <div className="member-row__actions">
                  <StatusLabel tone={member.role === "OWNER" ? "success" : "neutral"}>
                    {member.role === "OWNER"
                      ? t("مدیر", "Owner", "Eigentümer", "Propietario")
                      : t("عضو", "Member", "Mitglied", "Miembro")}
                  </StatusLabel>
                  {isOwner && !isSelf && member.role === "FAMILY" ? (
                    <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: "promote", member })}>
                      {t("مدیر کردن", "Make owner", "Zum Eigentümer machen", "Hacer propietario")}
                    </Button>
                  ) : null}
                  {isOwner && member.role === "OWNER" && ownerCount > 1 ? (
                    <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: "demote", member })}>
                      {t("عضو عادی", "Make member", "Zum Mitglied machen", "Hacer miembro")}
                    </Button>
                  ) : null}
                  {isOwner && !isSelf ? (
                    <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: "remove", member })}>
                      {t("حذف", "Remove", "Entfernen", "Eliminar")}
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        <div className="member-leave">
          <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: "leave" })}>
            {t("ترک این خانواده", "Leave this household", "Haushalt verlassen", "Salir de este hogar")}
          </Button>
          {isOwner && ownerCount === 1 ? (
            <p className="text-metadata text-text-secondary">
              {t(
                "شما تنها مدیر هستید؛ برای ترک خانواده ابتدا عضو دیگری را مدیر کنید.",
                "You're the only owner; make someone else an owner before leaving.",
                "Sie sind die einzige Person mit Eigentümerrolle. Ernennen Sie zuerst ein weiteres Mitglied.",
                "Eres el único propietario. Asigna primero a otra persona como propietaria.",
              )}
            </p>
          ) : null}
        </div>
      </section>

      {data.invitations.length > 0 ? (
        <section aria-labelledby="invites-title">
          <div className="account-section-title">
            <div>
              <h2 id="invites-title">
                {t(
                  "دعوت‌ها و درخواست‌های عضویت",
                  "Invitations and membership requests",
                  "Einladungen und Beitrittsanfragen",
                  "Invitaciones y solicitudes de adhesión",
                )}
              </h2>
              <p>
                {t(
                  "پیوند پس از ۷ روز منقضی می‌شود و فقط درخواست می‌سازد. تطبیق شماره به‌معنای تأیید مالکیت آن نیست؛ عضویت و دسترسی پت فقط پس از تأیید شما فعال می‌شود.",
                  "The link expires after 7 days and only submits a request. A matching number does not prove ownership; membership and pet access start only after you approve.",
                  "Der Link läuft nach 7 Tagen ab und ermöglicht nur eine Anfrage. Eine passende Telefonnummer beweist nicht, wem sie gehört; Mitgliedschaft und Tierzugriff beginnen erst nach Ihrer Bestätigung.",
                  "El enlace vence después de 7 días y solo permite enviar una solicitud. Que el número coincida no demuestra quién es su titular; la adhesión y el acceso a las mascotas comienzan solo después de tu aprobación.",
                )}
              </p>
            </div>
          </div>
          <div className="security-list">
            {data.invitations.map((invite) => (
              <div className="security-row" key={invite.id}>
                <div className="security-row__icon" aria-hidden>
                  ✉
                </div>
                <div>
                  {invite.status === "REQUESTED" && invite.requester ? (
                    <>
                      <b>
                        {invite.requester.displayName ||
                          t(
                            "حساب درخواست‌دهنده",
                            "Requesting account",
                            "Anfragendes Konto",
                            "Cuenta solicitante",
                          )}
                      </b>
                      <p dir="ltr" className="contact-row__value">
                        {invite.requester.phoneMasked ?? invite.contactMasked}
                      </p>
                      <p>
                        {invite.requester.phoneVerified
                          ? t(
                              "شماره در حساب تأیید شده",
                              "Mobile verified on account",
                              "Telefonnummer im Konto bestätigt",
                              "Número verificado en la cuenta",
                            )
                          : t(
                              "شماره در حساب تأیید نشده؛ تطبیق آن اثبات مالکیت نیست",
                              "Mobile is unverified; a match is not proof of ownership",
                              "Die Telefonnummer ist im Konto nicht bestätigt; eine Übereinstimmung beweist keine Inhaberschaft.",
                              "El número no está verificado en la cuenta; que coincida no demuestra su titularidad.",
                            )}
                      </p>
                      {invite.requestedAt ? (
                        <p>
                          {t("درخواست در", "Requested at", "Angefragt am", "Solicitado el")}:{" "}
                          {formatAccountDate(invite.requestedAt, locale)}
                        </p>
                      ) : null}
                      <div>
                        <p>
                          {t(
                            "دسترسی پیشنهادی",
                            "Proposed access",
                            "Vorgeschlagener Zugriff",
                            "Acceso propuesto",
                          )}
                        </p>
                        <ul className="list-inside list-disc text-metadata text-text-secondary">
                          {invite.initialAccess.map((item) => {
                            const petName =
                              data.pets.find((pet) => pet.id === item.petId)?.name ??
                              t("حیوان حذف‌شده", "Removed pet", "Entferntes Tier", "Mascota eliminada");
                            const preset = PRESET_COPY[item.preset];
                            return (
                              <li key={`${item.petId}:${item.preset}`}>
                                {petName}: {t(preset.fa, preset.en, preset.de, preset.es)}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </>
                  ) : (
                    <>
                      <b dir="ltr" className="contact-row__value">
                        {invite.contactMasked}
                      </b>
                      <p>
                        {t(
                          "پیوند در انتظار استفاده · انقضا",
                          "Link awaiting use · expires",
                          "Link noch nicht verwendet · Ablauf",
                          "Enlace pendiente de uso · vence",
                        )}
                        : {formatAccountDate(invite.expiresAt, locale)}
                      </p>
                    </>
                  )}
                </div>
                {isOwner ? (
                  <div className="member-row__actions">
                    {invite.status === "REQUESTED" ? (
                      <>
                        <Button
                          size="sm"
                          isLoading={busyInvitation === invite.id}
                          onClick={() => invitationAction(invite.id, "approve")}
                        >
                          {t(
                            "تأیید عضویت",
                            "Approve membership",
                            "Mitgliedschaft bestätigen",
                            "Aprobar adhesión",
                          )}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busyInvitation === invite.id}
                          onClick={() => invitationAction(invite.id, "reject")}
                        >
                          {t("رد درخواست", "Reject request", "Anfrage ablehnen", "Rechazar solicitud")}
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        isLoading={busyInvitation === invite.id}
                        onClick={() => invitationAction(invite.id, "resend")}
                      >
                        {t(
                          "ساخت پیوند تازه",
                          "Create fresh link",
                          "Neuen Link erstellen",
                          "Crear enlace nuevo",
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busyInvitation === invite.id}
                      onClick={() => invitationAction(invite.id, "cancel")}
                    >
                      {t("لغو", "Revoke", "Widerrufen", "Revocar")}
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="pets-title">
        <div className="account-section-title">
          <div>
            <h2 id="pets-title">{t("دسترسی حیوانات", "Pet access", "Tierzugriff", "Acceso a mascotas")}</h2>
            <p>
              {t(
                "مجوزهای سلامت، مراقبت، رزرو و دسترسی موقت را برای هر حیوان جداگانه مدیریت کنید.",
                "Manage health, care, booking and temporary access per pet.",
                "Verwalten Sie Gesundheits-, Pflege-, Buchungs- und befristete Zugriffsrechte für jedes Tier einzeln.",
                "Administra por separado los permisos de salud, cuidados, reservas y acceso temporal de cada mascota.",
              )}
            </p>
          </div>
        </div>
        {data.pets.length === 0 ? (
          <p className="text-body text-text-secondary">
            {t(
              "هنوز حیوانی در این خانواده ثبت نشده است.",
              "No pets in this household yet.",
              "In diesem Haushalt sind noch keine Tiere registriert.",
              "Todavía no hay mascotas en este hogar.",
            )}
          </p>
        ) : (
          <div className="pet-access-cards">
            {data.pets.map((pet) => (
              <ContextSurface key={pet.id} className="pet-access-card">
                <div className="pet-access-avatar">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {pet.photoUrl ? <img src={pet.photoUrl} alt="" /> : pet.name.slice(0, 1)}
                </div>
                <div>
                  <b>{pet.name}</b>
                  <p>
                    {t(
                      `${num(data.grants.filter((g) => g.petId === pet.id && isActive(g, Date.now())).length)} دسترسی فعال`,
                      `${num(data.grants.filter((g) => g.petId === pet.id && isActive(g, Date.now())).length)} active grants`,
                      `${num(data.grants.filter((g) => g.petId === pet.id && isActive(g, Date.now())).length)} aktive Berechtigungen`,
                      `${num(data.grants.filter((g) => g.petId === pet.id && isActive(g, Date.now())).length)} permisos activos`,
                    )}
                  </p>
                </div>
                {isOwner ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => router.push(`/${locale}/profile/household/pets/${pet.id}/access`)}
                  >
                    {t("مدیریت دسترسی", "Manage access", "Zugriff verwalten", "Administrar acceso")}
                  </Button>
                ) : (
                  <span />
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push(`/${locale}/profile/household/pets/${pet.id}/lifecycle`)}
                >
                  {t("وضعیت زندگی", "Lifecycle", "Lebensstatus", "Estado de vida")}
                </Button>
              </ContextSurface>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="history-title">
        <div className="account-section-title">
          <div>
            <h2 id="history-title">
              {t("تاریخچهٔ دسترسی", "Access history", "Zugriffsverlauf", "Historial de acceso")}
            </h2>
            <p>
              {t(
                "دعوت‌ها، تغییر نقش و مجوز، حذف اعضا و پایان دسترسی موقت.",
                "Invitations, role and permission changes, removals and temporary access ending.",
                "Einladungen, Rollen- und Berechtigungsänderungen, entfernte Mitglieder und abgelaufene befristete Zugriffe.",
                "Invitaciones, cambios de rol y permisos, miembros eliminados y finalización de accesos temporales.",
              )}
            </p>
          </div>
        </div>
        {data.history.length ? (
          <div className="activity-list">
            {data.history.map((event) => (
              <div key={event.id}>
                <span aria-hidden />
                <p>
                  <b>
                    {HISTORY_LABELS[event.type]
                      ? t(...HISTORY_LABELS[event.type]!)
                      : t("رویداد دسترسی", "Access event", "Zugriffsereignis", "Evento de acceso")}
                  </b>
                  <small>{formatAccountDate(event.occurredAt, locale, true)}</small>
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-body text-text-secondary">
            {t(
              "هنوز رویدادی ثبت نشده است.",
              "No access events yet.",
              "Noch keine Zugriffsereignisse.",
              "Aún no hay eventos de acceso.",
            )}
          </p>
        )}
      </section>

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        household={data}
        onSent={async (message) => {
          setNotice(message);
          await loadDetail();
        }}
      />
      {resentInvite ? (
        <ShareInviteDialog invite={resentInvite} onClose={() => setResentInvite(null)} />
      ) : null}

      {confirm?.kind === "remove" ? (
        <ConfirmActionDialog
          open
          onClose={() => setConfirm(null)}
          title={t(
            `حذف ${confirm.member.user.displayName} از خانواده`,
            `Remove ${confirm.member.user.displayName}`,
            `${confirm.member.user.displayName} aus dem Haushalt entfernen`,
            `Eliminar a ${confirm.member.user.displayName} del hogar`,
          )}
          consequences={[
            t(
              "دسترسی‌های خانوادگی، دستی و موقت او به حیوان‌های این خانواده فوراً پایان می‌یابد.",
              "Their household, manual and temporary access to this household's pets ends immediately.",
              "Der Haushalts-, manuelle und befristete Zugriff auf die Tiere dieses Haushalts endet sofort.",
              "Su acceso familiar, manual y temporal a las mascotas de este hogar terminará de inmediato.",
            ),
            t(
              "به او اطلاع داده می‌شود که دسترسی‌اش پایان یافته است.",
              "They're told their access has ended.",
              "Die Person wird über das Ende ihres Zugriffs informiert.",
              "Se le notificará que su acceso ha finalizado.",
            ),
          ]}
          keeps={[
            t(
              "حساب شخصی او و هر چیزی که خودش ثبت کرده حذف نمی‌شود.",
              "Their own account and what they recorded stay intact.",
              "Das persönliche Konto und die selbst erfassten Daten bleiben erhalten.",
              "Su cuenta personal y los datos que haya registrado se conservarán.",
            ),
            t(
              "تاریخچهٔ دسترسی حفظ می‌شود.",
              "The access history is kept.",
              "Der Zugriffsverlauf bleibt erhalten.",
              "El historial de acceso se conservará.",
            ),
          ]}
          confirmLabel={t("حذف عضو", "Remove member", "Mitglied entfernen", "Eliminar miembro")}
          onConfirm={async () => {
            await householdsService.removeMember(data.id, confirm.member.id);
            await loadDetail();
          }}
        />
      ) : null}
      {confirm?.kind === "promote" || confirm?.kind === "demote" ? (
        <ConfirmActionDialog
          open
          destructive={confirm.kind === "demote"}
          onClose={() => setConfirm(null)}
          title={
            confirm.kind === "promote"
              ? t(
                  `${confirm.member.user.displayName} مدیر شود؟`,
                  `Make ${confirm.member.user.displayName} an owner?`,
                  `${confirm.member.user.displayName} zum Eigentümer machen?`,
                  `¿Hacer propietario a ${confirm.member.user.displayName}?`,
                )
              : t(
                  `${confirm.member.user.displayName} عضو عادی شود؟`,
                  `Make ${confirm.member.user.displayName} a member?`,
                  `${confirm.member.user.displayName} zum Mitglied machen?`,
                  `¿Hacer miembro a ${confirm.member.user.displayName}?`,
                )
          }
          consequences={
            confirm.kind === "promote"
              ? [
                  t(
                    "می‌تواند اعضا را دعوت یا حذف کند و دسترسی همهٔ حیوان‌ها را مدیریت کند.",
                    "They can invite or remove members and manage every pet's access.",
                    "Die Person kann Mitglieder einladen oder entfernen und den Zugriff auf alle Tiere verwalten.",
                    "Podrá invitar o eliminar miembros y administrar el acceso a todas las mascotas.",
                  ),
                  t(
                    "به همهٔ حیوان‌های این خانواده دسترسی کامل می‌گیرد.",
                    "They get full access to every pet in this household.",
                    "Sie erhält vollen Zugriff auf alle Tiere in diesem Haushalt.",
                    "Obtendrá acceso completo a todas las mascotas de este hogar.",
                  ),
                ]
              : [
                  t(
                    "دیگر نمی‌تواند اعضا یا دعوت‌ها را مدیریت کند.",
                    "They can no longer manage members or invitations.",
                    "Die Person kann Mitglieder und Einladungen nicht mehr verwalten.",
                    "Ya no podrá administrar miembros ni invitaciones.",
                  ),
                  t(
                    "دسترسی فعلی او به حیوان‌ها تغییر نمی‌کند؛ در صورت نیاز آن را جداگانه تنظیم کنید.",
                    "Their current pet access doesn't change; adjust it separately if needed.",
                    "Der aktuelle Tierzugriff bleibt unverändert und kann bei Bedarf separat angepasst werden.",
                    "Su acceso actual a las mascotas no cambiará; ajústalo por separado si es necesario.",
                  ),
                ]
          }
          confirmLabel={
            confirm.kind === "promote"
              ? t("مدیر شود", "Make owner", "Zum Eigentümer machen", "Hacer propietario")
              : t("عضو عادی شود", "Make member", "Zum Mitglied machen", "Hacer miembro")
          }
          onConfirm={async () => {
            await householdsService.changeMemberRole(
              data.id,
              confirm.member.id,
              confirm.kind === "promote" ? "OWNER" : "FAMILY",
            );
            await loadDetail();
          }}
        />
      ) : null}
      {confirm?.kind === "leave" ? (
        <ConfirmActionDialog
          open
          onClose={() => setConfirm(null)}
          title={t(
            `ترک ${householdName}`,
            `Leave ${householdName}`,
            `${householdName} verlassen`,
            `Salir de ${householdName}`,
          )}
          consequences={[
            t(
              "دسترسی شما به حیوان‌های این خانواده فوراً پایان می‌یابد.",
              "Your access to this household's pets ends immediately.",
              "Ihr Zugriff auf die Tiere dieses Haushalts endet sofort.",
              "Tu acceso a las mascotas de este hogar terminará de inmediato.",
            ),
            t(
              "برای بازگشت به دعوت تازه نیاز دارید.",
              "You'll need a new invitation to come back.",
              "Für eine Rückkehr benötigen Sie eine neue Einladung.",
              "Necesitarás una nueva invitación para volver.",
            ),
          ]}
          keeps={[
            t(
              "حساب شما و خانواده‌های دیگرتان تغییری نمی‌کنند.",
              "Your account and any other households stay as they are.",
              "Ihr Konto und Ihre anderen Haushalte bleiben unverändert.",
              "Tu cuenta y tus otros hogares no cambiarán.",
            ),
          ]}
          confirmLabel={t("ترک خانواده", "Leave household", "Haushalt verlassen", "Salir del hogar")}
          onConfirm={async () => {
            await householdsService.leave(data.id);
            setData(null);
            await loadList();
          }}
        />
      ) : null}
    </div>
  );
}

function InviteDialog({
  open,
  onClose,
  household,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  household: HouseholdCollaborationDto;
  onSent: (message: string) => Promise<void>;
}) {
  const { t, locale } = useAccountCopy();
  const [contact, setContact] = useState("");
  const [presets, setPresets] = useState<Record<string, Preset>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteText, setInviteText] = useState("");

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const initialAccess = household.pets
        .map((pet) => ({ petId: pet.id, preset: presets[pet.id] ?? "VIEW_ONLY" }))
        .filter((item): item is { petId: string; preset: Exclude<Preset, "NONE"> } => item.preset !== "NONE");
      const normalizedPhone = normalizeIranPhone(contact);
      if (!normalizedPhone) {
        setError(
          t(
            "شمارهٔ موبایل معتبر وارد کنید.",
            "Enter a valid mobile number.",
            "Geben Sie eine gültige Mobilnummer ein.",
            "Introduce un número de móvil válido.",
          ),
        );
        return;
      }
      const result = await householdsService.invite(household.id, {
        contact: normalizedPhone,
        initialAccess,
      });
      setContact("");
      setPresets({});
      const absoluteInviteUrl = new URL(`/${locale}${result.sharePath}`, window.location.origin).toString();
      setInviteUrl(absoluteInviteUrl);
      setInviteText(
        t(
          "برای پیوستن به خانوادهٔ من در اپت‌لایف، این پیوند را باز کنید.",
          "Join my family on opetlife by opening this link.",
          "Öffne diesen Link, um meiner Familie auf opetlife beizutreten.",
          "Abre este enlace para unirte a mi hogar en opetlife.",
        ),
      );
      await onSent(
        result.delivery === "IN_APP"
          ? t(
              "پیوند داخل حساب او هم قرار گرفت. پس از درخواست عضویت، تأیید نهایی با شماست؛ هیچ دسترسی‌ای زودتر فعال نمی‌شود.",
              "The link is also in their account. You must approve after they request membership; no access is granted beforehand.",
              "Der Link liegt auch im Konto der Person. Nach der Beitrittsanfrage müssen Sie zustimmen; vorher wird kein Zugriff gewährt.",
              "El enlace también está en su cuenta. Debes aprobar después de que solicite unirse; antes no se concede acceso.",
            )
          : t(
              "دعوت ثبت شد. پیوند را شخصاً به او بدهید؛ پیامک یا ایمیلی ارسال نشده است. عضویت فقط پس از تأیید شما فعال می‌شود.",
              "The invitation is saved. Share the link directly; no SMS or email was sent. Membership starts only after your approval.",
              "Die Einladung wurde gespeichert. Teilen Sie den Link direkt; es wurde keine SMS oder E-Mail gesendet. Die Mitgliedschaft beginnt erst nach Ihrer Zustimmung.",
              "La invitación se guardó. Comparte el enlace directamente; no se envió ningún SMS ni correo. La adhesión comienza solo después de tu aprobación.",
            ),
      );
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "ALREADY_HOUSEHOLD_MEMBER"
          ? t(
              "این فرد همین حالا عضو خانواده است.",
              "This person is already in your household.",
              "Diese Person gehört bereits zu Ihrem Haushalt.",
              "Esta persona ya pertenece a tu hogar.",
            )
          : t(
              "دعوت ارسال نشد. دوباره تلاش کنید.",
              "The invitation wasn't sent. Try again.",
              "Die Einladung konnte nicht gesendet werden. Bitte versuchen Sie es erneut.",
              "No se pudo enviar la invitación. Inténtalo de nuevo.",
            ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("دعوت به خانواده", "Invite to household", "Zum Haushalt einladen", "Invitar al hogar")}
    >
      <div className="flex flex-col gap-4">
        <Input
          label={t(
            "شمارهٔ موبایل عضو خانواده",
            "Family member's mobile number",
            "Mobilnummer des Familienmitglieds",
            "Número de móvil del familiar",
          )}
          type="tel"
          dir="ltr"
          autoComplete="tel"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          autoFocus
        />
        <p className="text-metadata text-text-secondary">
          {t(
            "شماره فقط برای تطبیق درخواست با حساب استفاده می‌شود و تأیید مالکیت نیست. پیامک یا ایمیلی برای تأیید فرستاده نمی‌شود؛ پیوند را خودتان به فرد بدهید.",
            "The number only matches the request to an account; it does not prove ownership. No verification SMS or email is sent; share the link yourself.",
            "Die Nummer ordnet die Anfrage einem Konto zu, bestätigt aber nicht die Inhaberschaft. Es wird keine Bestätigungs-SMS oder E-Mail gesendet; teilen Sie den Link selbst.",
            "El número solo vincula la solicitud con una cuenta; no demuestra la titularidad. No se envía SMS ni correo de verificación; comparte el enlace personalmente.",
          )}
        </p>
        <p className="text-metadata text-text-secondary">
          {t(
            "دسترسی پیشنهادی هر حیوان را انتخاب کنید. اطلاعات پت تا زمانی که درخواست را تأیید نکنید در اختیار عضو جدید قرار نمی‌گیرد.",
            "Choose proposed access for each pet. The new member cannot see pet information until you approve their request.",
            "Wählen Sie die vorgeschlagenen Zugriffsrechte je Tier. Das neue Mitglied sieht keine Tierdaten, bevor Sie die Anfrage bestätigen.",
            "Elige los permisos propuestos para cada mascota. El nuevo miembro no verá sus datos hasta que apruebes la solicitud.",
          )}
        </p>
        {household.pets.map((pet) => {
          const value = presets[pet.id] ?? "VIEW_ONLY";
          return (
            <div key={pet.id} className="flex flex-col gap-1">
              <Select
                label={pet.name}
                value={value}
                onChange={(e) => setPresets({ ...presets, [pet.id]: e.target.value as Preset })}
                options={(Object.keys(PRESET_COPY) as Preset[]).map((key) => ({
                  value: key,
                  label:
                    PRESET_COPY[key][
                      locale === "fa" ? "fa" : locale === "de" ? "de" : locale === "es" ? "es" : "en"
                    ],
                }))}
              />
              <p className="text-metadata text-text-secondary">
                {
                  PRESET_COPY[value][
                    locale === "fa"
                      ? "faHint"
                      : locale === "de"
                        ? "deHint"
                        : locale === "es"
                          ? "esHint"
                          : "enHint"
                  ]
                }
              </p>
            </div>
          );
        })}
        {error ? (
          <p role="alert" className="text-body text-state-urgent">
            {error}
          </p>
        ) : null}
        {inviteUrl ? (
          <section
            className="flex flex-col gap-3 rounded-2xl border border-border-subtle p-4"
            aria-labelledby="share-invite-title"
          >
            <div>
              <h3 id="share-invite-title" className="text-heading-sm">
                {t(
                  "پیوند دعوت آماده است",
                  "Invitation link is ready",
                  "Einladungslink bereit",
                  "Enlace de invitación listo",
                )}
              </h3>
              <p className="text-metadata text-text-secondary">
                {t(
                  "پیوند را کپی یا با برنامهٔ دلخواه به اشتراک بگذارید. تطبیق شماره آن را تأیید نمی‌کند؛ لینک فقط درخواست می‌سازد و عضویت تا تأیید شما فعال نمی‌شود.",
                  "Copy or share the link. A number match does not verify it; the link only submits a request, and membership stays inactive until you approve.",
                  "Kopieren oder teilen Sie den Link. Eine passende Nummer ist keine Verifizierung; der Link stellt nur eine Anfrage, und die Mitgliedschaft bleibt bis zu Ihrer Zustimmung inaktiv.",
                  "Copia o comparte el enlace. Que el número coincida no lo verifica; el enlace solo envía una solicitud y la adhesión queda inactiva hasta que la apruebes.",
                )}
              </p>
            </div>
            <Input
              label={t("پیوند دعوت", "Invitation link", "Einladungslink", "Enlace de invitación")}
              dir="ltr"
              readOnly
              value={inviteUrl}
              onFocus={(event) => event.currentTarget.select()}
            />
            <ShareBar url={inviteUrl} text={inviteText} />
            <a
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-border-subtle px-4 text-sm text-text-primary hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              href={`sms:?body=${encodeURIComponent(`${inviteText}\n${inviteUrl}`)}`}
            >
              {t("پیامک", "SMS", "SMS", "SMS")}
            </a>
          </section>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t("انصراف", "Cancel", "Abbrechen", "Cancelar")}
          </Button>
          <Button isLoading={busy} disabled={!normalizeIranPhone(contact)} onClick={send}>
            {t("ثبت دعوت", "Save invitation", "Einladung speichern", "Guardar invitación")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ShareInviteDialog({
  invite,
  onClose,
}: {
  invite: { url: string; text: string };
  onClose: () => void;
}) {
  const { t } = useAccountCopy();
  return (
    <Dialog
      open
      onClose={onClose}
      title={t(
        "اشتراک پیوند دعوت",
        "Share invitation link",
        "Einladungslink teilen",
        "Compartir enlace de invitación",
      )}
    >
      <div className="flex flex-col gap-4">
        <p className="text-body text-text-secondary">
          {t(
            "پیوند تازه ساخته شد. آن را کپی کنید یا برنامهٔ دلخواه را باز کنید؛ هیچ پیامی خودکار ارسال نمی‌شود.",
            "A fresh link is ready. Copy it or open a sharing app; no message is sent automatically.",
            "Ein neuer Link ist bereit. Kopieren Sie ihn oder öffnen Sie eine App zum Teilen; es wird keine Nachricht automatisch gesendet.",
            "Hay un enlace nuevo. Cópialo o abre una aplicación para compartir; no se envía ningún mensaje automáticamente.",
          )}
        </p>
        <Input
          label={t("پیوند دعوت", "Invitation link", "Einladungslink", "Enlace de invitación")}
          dir="ltr"
          readOnly
          value={invite.url}
          onFocus={(event) => event.currentTarget.select()}
        />
        <ShareBar url={invite.url} text={invite.text} />
        <a
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-border-subtle px-4 text-sm text-text-primary hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          href={`sms:?body=${encodeURIComponent(`${invite.text}\n${invite.url}`)}`}
        >
          {t("پیامک", "SMS", "SMS", "SMS")}
        </a>
      </div>
    </Dialog>
  );
}
