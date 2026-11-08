"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Avatar, Button, ContextSurface, Dialog, EmptyState, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import type { PetAccessFlags, PetDto } from "@petlife/types";
import { householdsService } from "@/services/households.service";
import { petsService, type ManagedPetAccessGrant } from "@/services/pets.service";
import type { HouseholdCollaborationDto } from "@/services/account.service";
import { AccountPageHeader } from "./AccountNav";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { ApiError } from "@/lib/api/client";

const VIEW_ONLY: PetAccessFlags = { canViewIdentity: true, canEditIdentity: false, canViewHealth: false, canEditHealth: false, canBookCare: false, canViewCareProfile: true, canEditCareProfile: false, canViewLocation: false, canManageAccess: false, canRecordClinicalData: false };
const CARE_HELPER: PetAccessFlags = { canViewIdentity: true, canEditIdentity: false, canViewHealth: true, canEditHealth: false, canBookCare: true, canViewCareProfile: true, canEditCareProfile: true, canViewLocation: true, canManageAccess: false, canRecordClinicalData: false };
const FULL: PetAccessFlags = { canViewIdentity: true, canEditIdentity: true, canViewHealth: true, canEditHealth: true, canBookCare: true, canViewCareProfile: true, canEditCareProfile: true, canViewLocation: true, canManageAccess: false, canRecordClinicalData: false };
const PRESETS = { VIEW_ONLY, CARE_HELPER, FULL };

const COPY = {
  fa: {
    eyebrow: "مجوزهای حیوان", deniedTitle: "دسترسی ممکن نیست", deniedDescription: "این حساب اجازهٔ مدیریت مجوزهای این حیوان را ندارد.", deniedHeading: "مجوز مدیریت ندارید", deniedHelp: "از مدیر اصلی خانواده بخواهید دسترسی شما را بررسی کند.", errorTitle: "بارگذاری دسترسی‌ها انجام نشد", offlineTitle: "اتصال اینترنت در دسترس نیست", offlineDescription: "پس از اتصال دوباره تلاش کنید.", retry: "تلاش دوباره", back: "بازگشت به خانواده", loading: "در حال بارگذاری", title: "دسترسی به", description: "اطلاعات پزشکی و خصوصی فقط در محدودهٔ مجوزهای روشن و قابل لغو در دسترس است.", principle: "عضویت خانواده ≠ دسترسی کامل", expiryRule: "انقضای دسترسی در بک‌اند اجرا می‌شود و فقط یک برچسب ظاهری نیست.", create: "ایجاد دسترسی", grants: "دسترسی‌های ثبت‌شده", emptyTitle: "دسترسی جداگانه‌ای ثبت نشده است", emptyDescription: "اعضای خانواده فقط مجوزهایی را دارند که برای این حیوان تعریف شده است.", newAccess: "دسترسی جدید", member: "عضو", preset: "سطح دسترسی", expiry: "زمان انقضا (اختیاری)", reason: "دلیل یا زمینه (اختیاری)", grant: "ثبت دسترسی", cancel: "انصراف", failed: "ذخیرهٔ دسترسی انجام نشد. دوباره تلاش کنید.", temporary: "دسترسی موقت", household: "دسترسی خانوادگی", active: "فعال", ended: "پایان‌یافته", accessUntil: "دسترسی تا", viewOnly: "فقط مشاهده", careHelper: "همیار مراقبت", revokeEarly: "لغو زودهنگام", full: "دسترسی کامل خانوادگی", revokeTitle: "لغو این دسترسی", revokeImmediate: "این دسترسی فوراً در سرور پایان می‌یابد و صفحه‌های حیوان برای او بسته می‌شود.", revoked: "او می‌بیند که دسترسی‌اش لغو شده است.", kept: "سابقهٔ این دسترسی در تاریخچه می‌ماند.", revoke: "لغو دسترسی", flags: ["مشاهده مشخصات", "ویرایش مشخصات", "مشاهده سلامت", "ویرایش سلامت", "مدیریت رزرو", "مشاهده مراقبت", "ویرایش مراقبت", "مشاهده موقعیت", "مدیریت دسترسی"],
  },
  en: {
    eyebrow: "PET PERMISSIONS", deniedTitle: "Access unavailable", deniedDescription: "This account cannot manage permissions for this pet.", deniedHeading: "You do not have management access", deniedHelp: "Ask the household organizer to review your access.", errorTitle: "Couldn't load access settings", offlineTitle: "You're offline", offlineDescription: "Reconnect to the internet, then try again.", retry: "Try again", back: "Back to household", loading: "Loading", title: "Access to", description: "Private and medical data is available only through explicit, revocable permissions.", principle: "Household membership ≠ full access", expiryRule: "Expiry is enforced by backend authorization, not only shown in the interface.", create: "Create access", grants: "Recorded access", emptyTitle: "No separate access has been granted", emptyDescription: "Household members only have the permissions set for this pet.", newAccess: "New access", member: "Member", preset: "Access preset", expiry: "Expiry (optional)", reason: "Reason or context (optional)", grant: "Grant access", cancel: "Cancel", failed: "Couldn't save access. Try again.", temporary: "Temporary access", household: "Household access", active: "Active", ended: "Ended", accessUntil: "Access until", viewOnly: "View only", careHelper: "Care helper", revokeEarly: "Revoke early", full: "Full household access", revokeTitle: "Revoke this access", revokeImmediate: "This access ends on the server immediately and the pet's pages close for them.", revoked: "They'll see that their access was revoked.", kept: "The grant stays in the access history.", revoke: "Revoke access", flags: ["View basic profile", "Edit identity", "View health", "Edit health", "Manage bookings", "View care", "Edit care", "View location", "Manage access"],
  },
  de: {
    eyebrow: "TIERBERECHTIGUNGEN", deniedTitle: "Zugriff nicht verfügbar", deniedDescription: "Dieses Konto darf die Berechtigungen für dieses Tier nicht verwalten.", deniedHeading: "Keine Verwaltungsberechtigung", deniedHelp: "Bitte die Haushaltsverwaltung, den Zugriff zu prüfen.", errorTitle: "Berechtigungen konnten nicht geladen werden", offlineTitle: "Keine Internetverbindung", offlineDescription: "Bitte verbinde dich mit dem Internet und versuche es erneut.", retry: "Erneut versuchen", back: "Zurück zum Haushalt", loading: "Wird geladen", title: "Zugriff auf", description: "Private und medizinische Daten sind nur mit ausdrücklich erteilten, widerrufbaren Berechtigungen verfügbar.", principle: "Haushaltsmitgliedschaft ≠ vollständiger Zugriff", expiryRule: "Der Ablauf wird serverseitig durchgesetzt und ist nicht nur ein Hinweis in der Oberfläche.", create: "Zugriff erteilen", grants: "Erteilte Zugriffe", emptyTitle: "Keine zusätzlichen Zugriffe erteilt", emptyDescription: "Haushaltsmitglieder haben nur die für dieses Tier festgelegten Berechtigungen.", newAccess: "Neuer Zugriff", member: "Mitglied", preset: "Berechtigungsstufe", expiry: "Ablaufdatum (optional)", reason: "Grund oder Kontext (optional)", grant: "Zugriff speichern", cancel: "Abbrechen", failed: "Zugriff konnte nicht gespeichert werden. Bitte erneut versuchen.", temporary: "Befristeter Zugriff", household: "Haushaltszugriff", active: "Aktiv", ended: "Beendet", accessUntil: "Zugriff bis", viewOnly: "Nur ansehen", careHelper: "Pflegehilfe", revokeEarly: "Vorzeitig widerrufen", full: "Vollständiger Haushaltszugriff", revokeTitle: "Diesen Zugriff widerrufen", revokeImmediate: "Der Zugriff endet sofort auf dem Server; die Tierseiten sind dann nicht mehr verfügbar.", revoked: "Die Person sieht, dass ihr Zugriff widerrufen wurde.", kept: "Der Zugriff bleibt im Verlauf dokumentiert.", revoke: "Zugriff widerrufen", flags: ["Profil ansehen", "Identität bearbeiten", "Gesundheit ansehen", "Gesundheit bearbeiten", "Buchungen verwalten", "Pflege ansehen", "Pflege bearbeiten", "Standort ansehen", "Zugriff verwalten"],
  },
  es: {
    eyebrow: "PERMISOS DE LA MASCOTA", deniedTitle: "Acceso no disponible", deniedDescription: "Esta cuenta no puede administrar los permisos de esta mascota.", deniedHeading: "No tienes acceso de administración", deniedHelp: "Pide a la persona responsable del hogar que revise tu acceso.", errorTitle: "No se pudieron cargar los permisos", offlineTitle: "Sin conexión a Internet", offlineDescription: "Conéctate a Internet y vuelve a intentarlo.", retry: "Intentar de nuevo", back: "Volver al hogar", loading: "Cargando", title: "Acceso a", description: "Los datos privados y médicos solo están disponibles mediante permisos explícitos y revocables.", principle: "Pertenecer al hogar ≠ acceso completo", expiryRule: "La caducidad se aplica en el servidor, no es solo una etiqueta visual.", create: "Conceder acceso", grants: "Accesos concedidos", emptyTitle: "No se han concedido accesos adicionales", emptyDescription: "Los miembros del hogar solo tienen los permisos definidos para esta mascota.", newAccess: "Nuevo acceso", member: "Miembro", preset: "Nivel de acceso", expiry: "Fecha de caducidad (opcional)", reason: "Motivo o contexto (opcional)", grant: "Guardar acceso", cancel: "Cancelar", failed: "No se pudo guardar el acceso. Inténtalo de nuevo.", temporary: "Acceso temporal", household: "Acceso del hogar", active: "Activo", ended: "Finalizado", accessUntil: "Acceso hasta", viewOnly: "Solo lectura", careHelper: "Ayudante de cuidados", revokeEarly: "Revocar antes", full: "Acceso completo del hogar", revokeTitle: "Revocar este acceso", revokeImmediate: "El acceso finalizará de inmediato en el servidor y sus páginas de la mascota dejarán de estar disponibles.", revoked: "La persona verá que se revocó su acceso.", kept: "El acceso permanecerá en el historial.", revoke: "Revocar acceso", flags: ["Ver perfil", "Editar identidad", "Ver salud", "Editar salud", "Gestionar reservas", "Ver cuidados", "Editar cuidados", "Ver ubicación", "Gestionar acceso"],
  },
} as const;

type LocaleCopy = (typeof COPY)[keyof typeof COPY];
const FLAG_KEYS: Array<keyof PetAccessFlags> = ["canViewIdentity", "canEditIdentity", "canViewHealth", "canEditHealth", "canBookCare", "canViewCareProfile", "canEditCareProfile", "canViewLocation", "canManageAccess"];

export function PetAccessView({ petId }: { petId: string }) {
  const locale = useLocale();
  const copy: LocaleCopy = COPY[locale as keyof typeof COPY] ?? COPY.en;
  const router = useRouter();
  const [pet, setPet] = useState<PetDto | null>(null);
  const [home, setHome] = useState<HouseholdCollaborationDto | null>(null);
  const [grants, setGrants] = useState<ManagedPetAccessGrant[] | null>(null);
  const [loadError, setLoadError] = useState<"ACCESS" | "OFFLINE" | "ERROR" | null>(null);
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [preset, setPreset] = useState<keyof typeof PRESETS>("VIEW_ONLY");
  const [expiresAt, setExpiresAt] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<ManagedPetAccessGrant | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const nextPet = await petsService.getById(petId);
      const [nextHome, nextGrants] = await Promise.all([householdsService.collaboration(nextPet.householdId), petsService.listAccessGrants(petId)]);
      setPet(nextPet);
      setHome(nextHome);
      setGrants(nextGrants);
      setUserId((value) => value || nextHome.members.find((member) => member.role !== "OWNER")?.userId || "");
    } catch (error) {
      setLoadError(error instanceof ApiError && error.status === 403 ? "ACCESS" : typeof navigator !== "undefined" && !navigator.onLine ? "OFFLINE" : "ERROR");
    }
  }, [petId]);

  useEffect(() => { void load(); }, [load]);

  async function create() {
    if (!userId) return;
    setBusy(true);
    setActionError(null);
    try {
      await petsService.createAccessGrant(petId, { userId, ...PRESETS[preset], ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}), reason: reason || undefined });
      setOpen(false);
      setExpiresAt("");
      setReason("");
      await load();
    } catch {
      setActionError(copy.failed);
    } finally {
      setBusy(false);
    }
  }

  async function update(grant: ManagedPetAccessGrant, next: keyof typeof PRESETS) {
    setBusy(true);
    setActionError(null);
    try {
      await petsService.updateAccessGrant(petId, grant.id, PRESETS[next]);
      await load();
    } catch {
      setActionError(copy.failed);
    } finally {
      setBusy(false);
    }
  }

  if (loadError === "ACCESS") return <div className="account-stack"><AccountPageHeader eyebrow={copy.eyebrow} title={copy.deniedTitle} description={copy.deniedDescription}/><EmptyState title={copy.deniedHeading} description={copy.deniedHelp} actionLabel={copy.back} onAction={() => router.push(`/${locale}/profile/household`)}/></div>;
  if (loadError) return <div className="account-stack"><AccountPageHeader eyebrow={copy.eyebrow} title={loadError === "OFFLINE" ? copy.offlineTitle : copy.errorTitle} description={loadError === "OFFLINE" ? copy.offlineDescription : copy.errorTitle}/><EmptyState title={loadError === "OFFLINE" ? copy.offlineTitle : copy.errorTitle} description={loadError === "OFFLINE" ? copy.offlineDescription : copy.failed} actionLabel={copy.retry} onAction={() => void load()}/></div>;
  if (!pet || !home || !grants) return <Skeleton className="h-96 w-full" aria-label={copy.loading}/>;
  const candidates = home.members.filter((member) => member.role !== "OWNER");
  const grantPresetOptions = [
    { value: "VIEW_ONLY", label: copy.viewOnly },
    { value: "CARE_HELPER", label: copy.careHelper },
    { value: "FULL", label: copy.full },
  ];

  return <div className="account-stack">
    <AccountPageHeader eyebrow={copy.eyebrow} title={`${copy.title} ${pet.name}`} description={copy.description}/>
    <ContextSurface className="permission-principle"><b>{copy.principle}</b><p>{copy.expiryRule}</p><Button onClick={() => setOpen(true)} disabled={!candidates.length}>{copy.create}</Button></ContextSurface>
    <section><div className="account-section-title"><h2>{copy.grants}</h2></div>{grants.length === 0 ? <EmptyState title={copy.emptyTitle} description={copy.emptyDescription} actionLabel={!candidates.length ? undefined : copy.create} onAction={!candidates.length ? undefined : () => setOpen(true)}/> : <div className="permission-grants">{grants.map((grant) => <ContextSurface key={grant.id} className={!grant.active ? "opacity-60" : ""}>
      <div className="permission-grant-head"><div className="flex items-center gap-3"><Avatar name={grant.user.displayName} src={grant.user.avatarUrl} size="sm"/><div><b>{grant.user.displayName}</b><p>{grant.source === "TEMPORARY" ? copy.temporary : copy.household}</p></div></div><StatusLabel tone={grant.active ? "success" : "neutral"}>{grant.active ? copy.active : copy.ended}</StatusLabel></div>
      {grant.expiresAt && <p className="permission-expiry">{copy.accessUntil} {new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(new Date(grant.expiresAt))}</p>}
      <div className="permission-chip-list">{FLAG_KEYS.filter((key) => grant[key]).map((key, index) => <span key={key}>{copy.flags[index]}</span>)}</div>
      {grant.active && grant.source !== "HOUSEHOLD" && <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" disabled={busy} onClick={() => update(grant, "VIEW_ONLY")}>{copy.viewOnly}</Button><Button size="sm" variant="secondary" disabled={busy} onClick={() => update(grant, "CARE_HELPER")}>{copy.careHelper}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => setRevoking(grant)}>{copy.revokeEarly}</Button></div>}
    </ContextSurface>)}</div>}</section>
    <Dialog open={open} onClose={() => setOpen(false)} title={copy.newAccess}><div className="flex flex-col gap-4">
      <Select label={copy.member} value={userId} onChange={(event) => setUserId(event.target.value)} options={candidates.map((member) => ({ value: member.userId, label: member.user.displayName }))}/>
      <Select label={copy.preset} value={preset} onChange={(event) => setPreset(event.target.value as keyof typeof PRESETS)} options={grantPresetOptions}/>
      <div className="permission-chip-list">{FLAG_KEYS.filter((key) => PRESETS[preset][key]).map((key) => <span key={key}>{copy.flags[FLAG_KEYS.indexOf(key)]}</span>)}</div>
      <Input label={copy.expiry} type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)}/>
      <Input label={copy.reason} value={reason} onChange={(event) => setReason(event.target.value)}/>
      <div className="flex gap-2"><Button isLoading={busy} onClick={create}>{copy.grant}</Button><Button variant="ghost" onClick={() => setOpen(false)}>{copy.cancel}</Button></div>
    </div></Dialog>
    {actionError && <p role="alert" className="text-body text-state-urgent">{actionError}</p>}
    {revoking && <ConfirmActionDialog open onClose={() => setRevoking(null)} title={copy.revokeTitle} consequences={[copy.revokeImmediate, copy.revoked]} keeps={[copy.kept]} confirmLabel={copy.revoke} onConfirm={async () => { try { await petsService.revokeAccessGrant(petId, revoking.id); await load(); setRevoking(null); } catch { setActionError(copy.failed); } }}/>}
  </div>;
}
