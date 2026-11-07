"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar, Button, ContextSurface, Dialog, EmptyState, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import type { HouseholdDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { householdsService } from "@/services/households.service";
import type { HouseholdCollaborationDto } from "@/services/account.service";
import { useSessionStore } from "@/stores/session-store";
import { AccountPageHeader } from "./AccountNav";
import { HouseholdNameEditor } from "./HouseholdNameEditor";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { formatAccountDate, useAccountCopy } from "./account-copy";
import { apiErrorText } from "@/lib/errors/api-error-text";

type Preset = "NONE" | "VIEW_ONLY" | "CARE_HELPER" | "FULL";
type Member = HouseholdCollaborationDto["members"][number];
type PendingConfirm = { kind: "remove"; member: Member } | { kind: "demote"; member: Member } | { kind: "promote"; member: Member } | { kind: "leave" } | null;

/** Plain-language summary of each invite preset — mirrors the exact flags the API grants (households.service PRESETS). */
const PRESET_COPY: Record<Preset, { fa: string; en: string; de: string; es: string; faHint: string; enHint: string; deHint: string; esHint: string }> = {
  NONE: { fa: "بدون دسترسی", en: "No access", de: "Kein Zugriff", es: "Sin acceso", faHint: "این حیوان به او نشان داده نمی‌شود.", enHint: "This pet isn't shared with them.", deHint: "Dieses Tier wird nicht mit der Person geteilt.", esHint: "Esta mascota no se comparte con esta persona." },
  VIEW_ONLY: { fa: "فقط مشاهده", en: "View only", de: "Nur ansehen", es: "Solo lectura", faHint: "هویت و پروفایل مراقبت را می‌بیند؛ سلامت و موقعیت را نه.", enHint: "Sees identity and care profile; not health or location.", deHint: "Sieht Identität und Pflegeprofil, aber keine Gesundheits- oder Standortdaten.", esHint: "Puede ver la identidad y el perfil de cuidados, pero no la salud ni la ubicación." },
  CARE_HELPER: { fa: "همیار مراقبت", en: "Care helper", de: "Pflegehilfe", es: "Ayudante de cuidados", faHint: "سلامت را می‌بیند، پروفایل مراقبت را ویرایش و رزرو می‌کند.", enHint: "Sees health, edits the care profile and can book care.", deHint: "Sieht Gesundheitsdaten, kann das Pflegeprofil bearbeiten und Termine buchen.", esHint: "Puede ver la salud, editar el perfil de cuidados y reservar servicios." },
  FULL: { fa: "دسترسی کامل خانوادگی", en: "Full household access", de: "Voller Haushaltszugriff", es: "Acceso completo al hogar", faHint: "همه‌چیز به‌جز مدیریت دسترسی دیگران.", enHint: "Everything except managing other people's access.", deHint: "Alles außer der Verwaltung der Zugriffsrechte anderer Personen.", esHint: "Todo excepto administrar el acceso de otras personas." },
};

const HISTORY_LABELS: Record<string, [string, string, string, string]> = {
  HouseholdInvitationCreated: ["دعوت ارسال شد", "Invitation sent", "Einladung gesendet", "Invitación enviada"],
  HouseholdInvitationResent: ["دعوت دوباره ارسال شد", "Invitation resent", "Einladung erneut gesendet", "Invitación reenviada"],
  HouseholdInvitationCancelled: ["دعوت لغو شد", "Invitation cancelled", "Einladung storniert", "Invitación cancelada"],
  HouseholdInvitationAccepted: ["دعوت پذیرفته شد", "Invitation accepted", "Einladung angenommen", "Invitación aceptada"],
  HouseholdInvitationDeclined: ["دعوت رد شد", "Invitation declined", "Einladung abgelehnt", "Invitación rechazada"],
  PetAccessGranted: ["دسترسی داده شد", "Access granted", "Zugriff gewährt", "Acceso concedido"],
  PetAccessChanged: ["دسترسی تغییر کرد", "Access changed", "Zugriff geändert", "Acceso modificado"],
  PetAccessRevoked: ["دسترسی لغو شد", "Access revoked", "Zugriff entzogen", "Acceso revocado"],
  TemporaryPetAccessExpired: ["دسترسی موقت پایان یافت", "Temporary access ended", "Temporärer Zugriff beendet", "Acceso temporal finalizado"],
  HouseholdMemberRemoved: ["عضوی حذف شد", "A member was removed", "Ein Mitglied wurde entfernt", "Se eliminó a un miembro"],
  HouseholdMemberLeft: ["عضوی خانواده را ترک کرد", "A member left", "Ein Mitglied hat den Haushalt verlassen", "Un miembro salió del hogar"],
  HouseholdMemberRoleChanged: ["نقش یک عضو تغییر کرد", "A member's role changed", "Mitgliedsrolle geändert", "Rol de un miembro modificado"],
};

function isActive(grant: { startsAt: string | null; expiresAt: string | null }, now: number) {
  return (!grant.startsAt || new Date(grant.startsAt).getTime() <= now) && (!grant.expiresAt || new Date(grant.expiresAt).getTime() > now);
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
  const [confirm, setConfirm] = useState<PendingConfirm>(null);
  const [busyInvitation, setBusyInvitation] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setFailed(false);
    try {
      const list = await householdsService.listMine();
      setHouseholds(list);
      setSelectedId((current) => (list.some((h) => h.id === current) ? current : list[0]?.id ?? ""));
    } catch {
      setFailed(true);
    }
  }, []);

  const loadDetail = useCallback(async () => {
    if (!selectedId) {
      setData(null);
      return;
    }
    setFailed(false);
    try {
      setData(await householdsService.collaboration(selectedId));
    } catch {
      setFailed(true);
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

  if (failed) return <ErrorRecovery title={t("خانواده و دسترسی", "Household & access", "Haushalt und Zugriff", "Hogar y acceso")} message={t("اطلاعات خانواده بارگذاری نشد.", "Your household didn't load.", "Der Haushalt konnte nicht geladen werden.", "No se pudo cargar el hogar.")} retryLabel={t("تلاش دوباره", "Retry", "Erneut versuchen", "Reintentar")} onRetry={() => (households ? loadDetail() : loadList())} />;
  if (!households) return <Skeleton className="h-96 w-full" aria-label={t("در حال بارگذاری", "Loading", "Wird geladen", "Cargando")} />;

  if (!households.length) {
    return (
      <div className="account-stack">
        <AccountPageHeader eyebrow={t("خانواده", "HOUSEHOLD", "HAUSHALT", "HOGAR")} title={t("همکاری امن برای مراقبت", "Care together, securely", "Gemeinsam sicher für Tiere sorgen", "Cuidados compartidos y seguros")} description={t("هر فرد حساب خودش را دارد و دسترسی هر حیوان جداگانه تعیین می‌شود.", "Everyone keeps their own account and each pet's access is explicit.", "Jede Person behält ihr eigenes Konto; der Zugriff auf jedes Tier wird einzeln festgelegt.", "Cada persona conserva su cuenta y el acceso a cada mascota se define por separado.")} />
        <EmptyState title={t("هنوز خانواده‌ای ندارید", "No household yet", "Noch kein Haushalt", "Aún no tienes un hogar")} description={t("خانهٔ شما هنگام افزودن اولین حیوان ساخته می‌شود.", "Your household is created when you add your first pet.", "Ihr Haushalt wird angelegt, sobald Sie Ihr erstes Tier hinzufügen.", "Tu hogar se crea cuando añades tu primera mascota.")} actionLabel={t("شروع راه‌اندازی", "Start setup", "Einrichtung starten", "Iniciar configuración")} onAction={() => router.push(`/${locale}/onboarding`)} />
      </div>
    );
  }
  if (!data) return <Skeleton className="h-96 w-full" aria-label={t("در حال بارگذاری", "Loading", "Wird geladen", "Cargando")} />;

  const isOwner = data.currentUserRole === "OWNER";
  const ownerCount = data.members.filter((m) => m.role === "OWNER").length;
  const householdName = data.name || t("خانهٔ من", "My household", "Mein Haushalt", "Mi hogar");

  async function invitationAction(id: string, action: "resend" | "cancel") {
    if (!data) return;
    setBusyInvitation(id);
    setNotice(null);
    try {
      if (action === "resend") await householdsService.resendInvitation(data.id, id);
      else await householdsService.cancelInvitation(data.id, id);
      setNotice(action === "resend" ? t("دعوت دوباره ارسال شد و مهلت آن تمدید شد.", "The invitation was resent with a fresh expiry.", "Die Einladung wurde mit neuer Laufzeit erneut gesendet.", "La invitación se reenvió con un nuevo plazo.") : t("دعوت لغو شد.", "The invitation was cancelled.", "Die Einladung wurde storniert.", "La invitación se canceló."));
      await loadDetail();
    } catch (err) {
      setNotice(apiErrorText(err, undefined, t("انجام نشد.", "That didn't work.", "Das hat nicht funktioniert.", "No se pudo completar.")));
    } finally {
      setBusyInvitation(null);
    }
  }

  return (
    <div className="account-stack">
      <AccountPageHeader eyebrow={t("خانواده و دسترسی", "HOUSEHOLD & ACCESS", "HAUSHALT UND ZUGRIFF", "HOGAR Y ACCESO")} title={householdName} description={t("عضویت در خانواده به معنی دسترسی کامل به اطلاعات حیوان نیست؛ هر دسترسی جداگانه، شفاف و قابل لغو است.", "Being in a household never means automatic full pet access; every grant is separate, visible and reversible.", "Die Haushaltsmitgliedschaft gewährt keinen automatischen Vollzugriff auf Tierdaten. Jede Berechtigung ist separat, sichtbar und widerrufbar.", "Ser miembro del hogar no da acceso automático a todos los datos de las mascotas. Cada permiso es independiente, visible y revocable.")} />
      {isOwner ? <HouseholdNameEditor key={data.id + householdName} id={data.id} name={householdName} onSaved={async () => { await loadList(); await loadDetail(); }} /> : null}
      {notice ? <div className="account-notice" role="status">{notice}</div> : null}
      {households.length > 1 ? <Select label={t("خانواده", "Household", "Haushalt", "Hogar")} value={selectedId} onChange={(e) => setSelectedId(e.target.value)} options={households.map((h) => ({ value: h.id, label: h.name || t("خانهٔ بدون نام", "Unnamed household", "Unbenannter Haushalt", "Hogar sin nombre") }))} /> : null}

      <section aria-labelledby="members-title">
        <div className="account-section-title">
          <div>
            <h2 id="members-title">{t("اعضا", "Members", "Mitglieder", "Miembros")}</h2>
            <p>{t("مدیران، خانواده و دعوت‌ها را مدیریت می‌کنند؛ اعضا فقط به حیوان‌هایی که با آن‌ها به اشتراک گذاشته شده دسترسی دارند.", "Owners manage the household and invitations; members only reach the pets shared with them.", "Eigentümer verwalten Haushalt und Einladungen. Mitglieder sehen nur die ausdrücklich mit ihnen geteilten Tiere.", "Los propietarios administran el hogar y las invitaciones. Los miembros solo acceden a las mascotas compartidas con ellos.")}</p>
          </div>
          {isOwner ? <Button onClick={() => setInviteOpen(true)}>{t("دعوت عضو", "Invite member", "Mitglied einladen", "Invitar a un miembro")}</Button> : null}
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
                    {isSelf ? <span className="text-text-secondary"> · {t("شما", "you", "Sie", "tú")}</span> : null}
                  </b>
                  <p>
                    {access?.pets.length ? t(`دسترسی به ${access.pets.join("، ")}`, `Access to ${access.pets.join(", ")}`, `Zugriff auf ${access.pets.join(", ")}`, `Acceso a ${access.pets.join(", ")}`) : t("بدون دسترسی فعال به حیوان", "No active pet access", "Kein aktiver Tierzugriff", "Sin acceso activo a mascotas")}
                    {access?.temporary ? ` · ${t(`${num(access.temporary)} دسترسی موقت`, `${num(access.temporary)} temporary`, `${num(access.temporary)} befristet`, `${num(access.temporary)} temporal`)}` : ""}
                  </p>
                  <p className="text-metadata text-text-secondary">{t("عضو از", "Joined", "Mitglied seit", "Se unió el")} {formatAccountDate(member.createdAt, locale)}</p>
                </div>
                <div className="member-row__actions">
                  <StatusLabel tone={member.role === "OWNER" ? "success" : "neutral"}>{member.role === "OWNER" ? t("مدیر", "Owner", "Eigentümer", "Propietario") : t("عضو", "Member", "Mitglied", "Miembro")}</StatusLabel>
                  {isOwner && !isSelf && member.role === "FAMILY" ? <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: "promote", member })}>{t("مدیر کردن", "Make owner", "Zum Eigentümer machen", "Hacer propietario")}</Button> : null}
                  {isOwner && member.role === "OWNER" && ownerCount > 1 ? <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: "demote", member })}>{t("عضو عادی", "Make member", "Zum Mitglied machen", "Hacer miembro")}</Button> : null}
                  {isOwner && !isSelf ? <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: "remove", member })}>{t("حذف", "Remove", "Entfernen", "Eliminar")}</Button> : null}
                </div>
              </div>
            );
          })}
        </div>
        <div className="member-leave">
          <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: "leave" })}>{t("ترک این خانواده", "Leave this household", "Haushalt verlassen", "Salir de este hogar")}</Button>
          {isOwner && ownerCount === 1 ? <p className="text-metadata text-text-secondary">{t("شما تنها مدیر هستید؛ برای ترک خانواده ابتدا عضو دیگری را مدیر کنید.", "You're the only owner; make someone else an owner before leaving.", "Sie sind die einzige Person mit Eigentümerrolle. Ernennen Sie zuerst ein weiteres Mitglied.", "Eres el único propietario. Asigna primero a otra persona como propietaria.")}</p> : null}
        </div>
      </section>

      {data.invitations.length > 0 ? (
        <section aria-labelledby="invites-title">
          <div className="account-section-title">
            <div>
              <h2 id="invites-title">{t("دعوت‌های در انتظار", "Pending invitations", "Ausstehende Einladungen", "Invitaciones pendientes")}</h2>
              <p>{t("هر دعوت فقط یک بار و فقط توسط همان ایمیل یا موبایل قابل پذیرش است و پس از ۷ روز منقضی می‌شود.", "Each invitation works once, only for that email or phone, and expires after 7 days.", "Jede Einladung kann einmalig mit derselben E-Mail-Adresse oder Telefonnummer angenommen werden und läuft nach 7 Tagen ab.", "Cada invitación solo puede aceptarse una vez con el mismo correo o teléfono y vence después de 7 días.")}</p>
            </div>
          </div>
          <div className="security-list">
            {data.invitations.map((invite) => (
              <div className="security-row" key={invite.id}>
                <div className="security-row__icon" aria-hidden>✉</div>
                <div>
                  <b dir="ltr" className="contact-row__value">{invite.contactMasked}</b>
                  <p>{t("انقضا", "Expires", "Läuft ab", "Vence")} : {formatAccountDate(invite.expiresAt, locale)}</p>
                </div>
                {isOwner ? (
                  <div className="member-row__actions">
                    <Button variant="ghost" size="sm" isLoading={busyInvitation === invite.id} onClick={() => invitationAction(invite.id, "resend")}>{t("ارسال دوباره", "Resend", "Erneut senden", "Reenviar")}</Button>
                    <Button variant="ghost" size="sm" disabled={busyInvitation === invite.id} onClick={() => invitationAction(invite.id, "cancel")}>{t("لغو", "Cancel", "Abbrechen", "Cancelar")}</Button>
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
            <p>{t("مجوزهای سلامت، مراقبت، رزرو و دسترسی موقت را برای هر حیوان جداگانه مدیریت کنید.", "Manage health, care, booking and temporary access per pet.", "Verwalten Sie Gesundheits-, Pflege-, Buchungs- und befristete Zugriffsrechte für jedes Tier einzeln.", "Administra por separado los permisos de salud, cuidados, reservas y acceso temporal de cada mascota.")}</p>
          </div>
        </div>
        {data.pets.length === 0 ? (
          <p className="text-body text-text-secondary">{t("هنوز حیوانی در این خانواده ثبت نشده است.", "No pets in this household yet.", "In diesem Haushalt sind noch keine Tiere registriert.", "Todavía no hay mascotas en este hogar.")}</p>
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
                  <p>{t(`${num(data.grants.filter((g) => g.petId === pet.id && isActive(g, Date.now())).length)} دسترسی فعال`, `${num(data.grants.filter((g) => g.petId === pet.id && isActive(g, Date.now())).length)} active grants`, `${num(data.grants.filter((g) => g.petId === pet.id && isActive(g, Date.now())).length)} aktive Berechtigungen`, `${num(data.grants.filter((g) => g.petId === pet.id && isActive(g, Date.now())).length)} permisos activos`)}</p>
                </div>
                {isOwner ? <Button variant="secondary" size="sm" onClick={() => router.push(`/${locale}/profile/household/pets/${pet.id}/access`)}>{t("مدیریت دسترسی", "Manage access", "Zugriff verwalten", "Administrar acceso")}</Button> : <span />}
                <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/profile/household/pets/${pet.id}/lifecycle`)}>{t("وضعیت زندگی", "Lifecycle", "Lebensstatus", "Estado de vida")}</Button>
              </ContextSurface>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="history-title">
        <div className="account-section-title">
          <div>
            <h2 id="history-title">{t("تاریخچهٔ دسترسی", "Access history", "Zugriffsverlauf", "Historial de acceso")}</h2>
            <p>{t("دعوت‌ها، تغییر نقش و مجوز، حذف اعضا و پایان دسترسی موقت.", "Invitations, role and permission changes, removals and temporary access ending.", "Einladungen, Rollen- und Berechtigungsänderungen, entfernte Mitglieder und abgelaufene befristete Zugriffe.", "Invitaciones, cambios de rol y permisos, miembros eliminados y finalización de accesos temporales.")}</p>
          </div>
        </div>
        {data.history.length ? (
          <div className="activity-list">
            {data.history.map((event) => (
              <div key={event.id}>
                <span aria-hidden />
                <p>
                  <b>{HISTORY_LABELS[event.type] ? t(...HISTORY_LABELS[event.type]!) : event.type}</b>
                  <small>{formatAccountDate(event.occurredAt, locale, true)}</small>
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-body text-text-secondary">{t("هنوز رویدادی ثبت نشده است.", "No access events yet.", "Noch keine Zugriffsereignisse.", "Aún no hay eventos de acceso.")}</p>
        )}
      </section>

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        household={data}
        onSent={async (message) => {
          setInviteOpen(false);
          setNotice(message);
          await loadDetail();
        }}
      />

      {confirm?.kind === "remove" ? (
        <ConfirmActionDialog
          open
          onClose={() => setConfirm(null)}
          title={t(`حذف ${confirm.member.user.displayName} از خانواده`, `Remove ${confirm.member.user.displayName}`, `${confirm.member.user.displayName} aus dem Haushalt entfernen`, `Eliminar a ${confirm.member.user.displayName} del hogar`)}
          consequences={[t("دسترسی‌های خانوادگی، دستی و موقت او به حیوان‌های این خانواده فوراً پایان می‌یابد.", "Their household, manual and temporary access to this household's pets ends immediately.", "Der Haushalts-, manuelle und befristete Zugriff auf die Tiere dieses Haushalts endet sofort.", "Su acceso familiar, manual y temporal a las mascotas de este hogar terminará de inmediato."), t("به او اطلاع داده می‌شود که دسترسی‌اش پایان یافته است.", "They're told their access has ended.", "Die Person wird über das Ende ihres Zugriffs informiert.", "Se le notificará que su acceso ha finalizado.")]}
          keeps={[t("حساب شخصی او و هر چیزی که خودش ثبت کرده حذف نمی‌شود.", "Their own account and what they recorded stay intact.", "Das persönliche Konto und die selbst erfassten Daten bleiben erhalten.", "Su cuenta personal y los datos que haya registrado se conservarán."), t("تاریخچهٔ دسترسی حفظ می‌شود.", "The access history is kept.", "Der Zugriffsverlauf bleibt erhalten.", "El historial de acceso se conservará.")]}
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
          title={confirm.kind === "promote" ? t(`${confirm.member.user.displayName} مدیر شود؟`, `Make ${confirm.member.user.displayName} an owner?`, `${confirm.member.user.displayName} zum Eigentümer machen?`, `¿Hacer propietario a ${confirm.member.user.displayName}?`) : t(`${confirm.member.user.displayName} عضو عادی شود؟`, `Make ${confirm.member.user.displayName} a member?`, `${confirm.member.user.displayName} zum Mitglied machen?`, `¿Hacer miembro a ${confirm.member.user.displayName}?`)}
          consequences={
            confirm.kind === "promote"
              ? [t("می‌تواند اعضا را دعوت یا حذف کند و دسترسی همهٔ حیوان‌ها را مدیریت کند.", "They can invite or remove members and manage every pet's access.", "Die Person kann Mitglieder einladen oder entfernen und den Zugriff auf alle Tiere verwalten.", "Podrá invitar o eliminar miembros y administrar el acceso a todas las mascotas."), t("به همهٔ حیوان‌های این خانواده دسترسی کامل می‌گیرد.", "They get full access to every pet in this household.", "Sie erhält vollen Zugriff auf alle Tiere in diesem Haushalt.", "Obtendrá acceso completo a todas las mascotas de este hogar.")]
              : [t("دیگر نمی‌تواند اعضا یا دعوت‌ها را مدیریت کند.", "They can no longer manage members or invitations.", "Die Person kann Mitglieder und Einladungen nicht mehr verwalten.", "Ya no podrá administrar miembros ni invitaciones."), t("دسترسی فعلی او به حیوان‌ها تغییر نمی‌کند؛ در صورت نیاز آن را جداگانه تنظیم کنید.", "Their current pet access doesn't change; adjust it separately if needed.", "Der aktuelle Tierzugriff bleibt unverändert und kann bei Bedarf separat angepasst werden.", "Su acceso actual a las mascotas no cambiará; ajústalo por separado si es necesario.")]
          }
          confirmLabel={confirm.kind === "promote" ? t("مدیر شود", "Make owner", "Zum Eigentümer machen", "Hacer propietario") : t("عضو عادی شود", "Make member", "Zum Mitglied machen", "Hacer miembro")}
          onConfirm={async () => {
            await householdsService.changeMemberRole(data.id, confirm.member.id, confirm.kind === "promote" ? "OWNER" : "FAMILY");
            await loadDetail();
          }}
        />
      ) : null}
      {confirm?.kind === "leave" ? (
        <ConfirmActionDialog
          open
          onClose={() => setConfirm(null)}
          title={t(`ترک ${householdName}`, `Leave ${householdName}`, `${householdName} verlassen`, `Salir de ${householdName}`)}
          consequences={[t("دسترسی شما به حیوان‌های این خانواده فوراً پایان می‌یابد.", "Your access to this household's pets ends immediately.", "Ihr Zugriff auf die Tiere dieses Haushalts endet sofort.", "Tu acceso a las mascotas de este hogar terminará de inmediato."), t("برای بازگشت به دعوت تازه نیاز دارید.", "You'll need a new invitation to come back.", "Für eine Rückkehr benötigen Sie eine neue Einladung.", "Necesitarás una nueva invitación para volver.")]}
          keeps={[t("حساب شما و خانواده‌های دیگرتان تغییری نمی‌کنند.", "Your account and any other households stay as they are.", "Ihr Konto und Ihre anderen Haushalte bleiben unverändert.", "Tu cuenta y tus otros hogares no cambiarán.")]}
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

function InviteDialog({ open, onClose, household, onSent }: { open: boolean; onClose: () => void; household: HouseholdCollaborationDto; onSent: (message: string) => Promise<void> }) {
  const { t, locale } = useAccountCopy();
  const [contact, setContact] = useState("");
  const [presets, setPresets] = useState<Record<string, Preset>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const initialAccess = household.pets
        .map((pet) => ({ petId: pet.id, preset: presets[pet.id] ?? "VIEW_ONLY" }))
        .filter((item): item is { petId: string; preset: Exclude<Preset, "NONE"> } => item.preset !== "NONE");
      const result = await householdsService.invite(household.id, { contact: contact.trim(), initialAccess });
      setContact("");
      setPresets({});
      await onSent(
        result.delivery === "DELIVERED"
          ? t("دعوت امن داخل opetlife برای او ارسال شد.", "A secure in-app invitation was delivered.", "Eine sichere Einladung wurde in der App zugestellt.", "Se envió una invitación segura dentro de la aplicación.")
          : t("دعوت ذخیره شد، اما ارسال پیامک و ایمیل هنوز متصل نیست؛ از او بخواهید با همین ایمیل یا موبایل وارد opetlife شود تا دعوت را ببیند.", "Invitation saved, but SMS and email delivery isn't connected yet. Ask them to sign in to opetlife with this email or phone to see it.", "Die Einladung wurde gespeichert, aber SMS- und E-Mail-Versand sind noch nicht verbunden. Die eingeladene Person muss sich mit dieser E-Mail-Adresse oder Telefonnummer bei opetlife anmelden.", "La invitación se guardó, pero el envío de SMS y correo aún no está conectado. Pídele a la persona que inicie sesión en opetlife con ese correo o teléfono para verla."),
      );
    } catch (err) {
      setError(err instanceof ApiError && err.code === "ALREADY_HOUSEHOLD_MEMBER" ? t("این فرد همین حالا عضو خانواده است.", "This person is already in your household.", "Diese Person gehört bereits zu Ihrem Haushalt.", "Esta persona ya pertenece a tu hogar.") : apiErrorText(err, undefined, t("دعوت ارسال نشد.", "The invitation wasn't sent.", "Die Einladung konnte nicht gesendet werden.", "No se pudo enviar la invitación.")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t("دعوت به خانواده", "Invite to household", "Zum Haushalt einladen", "Invitar al hogar")}>
      <div className="flex flex-col gap-4">
        <Input label={t("ایمیل یا موبایل", "Email or phone", "E-Mail oder Telefonnummer", "Correo o teléfono")} dir="ltr" value={contact} onChange={(e) => setContact(e.target.value)} autoFocus />
        <p className="text-metadata text-text-secondary">{t("برای هر حیوان دسترسی اولیه را انتخاب کنید. دعوت‌شونده پیش از پذیرش همین خلاصه را می‌بیند و بعداً می‌توانید آن را دقیق‌تر تنظیم کنید.", "Choose starting access for each pet. The invitee sees this summary before accepting, and you can fine-tune it later.", "Legen Sie für jedes Tier den anfänglichen Zugriff fest. Die eingeladene Person sieht diese Übersicht vor der Annahme; später können Sie die Rechte genauer anpassen.", "Elige el acceso inicial para cada mascota. La persona invitada verá este resumen antes de aceptar y podrás ajustar los permisos más adelante.")}</p>
        {household.pets.map((pet) => {
          const value = presets[pet.id] ?? "VIEW_ONLY";
          return (
            <div key={pet.id} className="flex flex-col gap-1">
              <Select label={pet.name} value={value} onChange={(e) => setPresets({ ...presets, [pet.id]: e.target.value as Preset })} options={(Object.keys(PRESET_COPY) as Preset[]).map((key) => ({ value: key, label: PRESET_COPY[key][locale === "fa" ? "fa" : locale === "de" ? "de" : locale === "es" ? "es" : "en"] }))} />
              <p className="text-metadata text-text-secondary">{PRESET_COPY[value][locale === "fa" ? "faHint" : locale === "de" ? "deHint" : locale === "es" ? "esHint" : "enHint"]}</p>
            </div>
          );
        })}
        {error ? <p role="alert" className="text-body text-state-urgent">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t("انصراف", "Cancel", "Abbrechen", "Cancelar")}</Button>
          <Button isLoading={busy} disabled={contact.trim().length < 5} onClick={send}>{t("ارسال دعوت", "Send invitation", "Einladung senden", "Enviar invitación")}</Button>
        </div>
      </div>
    </Dialog>
  );
}
