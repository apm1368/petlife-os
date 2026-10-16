"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, Dialog, Input, Select } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { clinicTeamService, type ClinicBranches, type ClinicStaffRoster } from "@/services/clinic-team.service";
import { useProviderStore } from "@/stores/provider-store";

type Removal = { kind: "member" | "invitation" | "branch"; id: string; name: string };

export function ClinicTeamManagement({ section }: { section: "staff" | "branches" }) {
  const organization = useProviderStore(s => s.context?.active?.providerOrganizationId);
  return <ClinicTeamContent key={`${organization}-${section}`} section={section} />;
}

function ClinicTeamContent({ section }: { section: "staff" | "branches" }) {
  const t = useTranslations("clinicTeam"), locale = useLocale();
  const owner = useProviderStore(s => s.context?.active?.role === "OWNER");
  const [staff, setStaff] = useState<ClinicStaffRoster | null>(null);
  const [branches, setBranches] = useState<ClinicBranches | null>(null);
  const [loading, setLoading] = useState(true), [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null), [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  const [email, setEmail] = useState(""), [role, setRole] = useState<"VET" | "STAFF">("VET"), [title, setTitle] = useState("");
  const [name, setName] = useState(""), [city, setCity] = useState(""), [address, setAddress] = useState("");
  const [region, setRegion] = useState(""), [phone, setPhone] = useState("");
  const [latitude, setLatitude] = useState(""), [longitude, setLongitude] = useState("");
  const [removal, setRemoval] = useState<Removal | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadFailed(false);
    const request = section === "staff"
      ? clinicTeamService.staff(controller.signal).then(data => { if (!controller.signal.aborted) setStaff(data); })
      : clinicTeamService.branches(controller.signal).then(data => { if (!controller.signal.aborted) setBranches(data); });
    request.catch(() => { if (!controller.signal.aborted) setLoadFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [section, revision]);

  function explain(e: unknown) {
    if (e instanceof ApiError) {
      const known: Record<string, string> = {
        CLINIC_BRANCH_IN_USE: "branchInUse", SUBSCRIPTION_ENTITLEMENT_LIMIT_EXCEEDED: "limitReached",
        CLINIC_STAFF_ALREADY_MEMBER: "alreadyMember", CLINIC_INVITATION_CONFLICT: "invitationConflict",
        NOT_FOUND: "notFound", PROVIDER_ACCESS_DENIED: "accessDenied",
      };
      return t(known[e.code] ?? "saveFailed");
    }
    return t("saveFailed");
  }
  async function mutate(action: () => Promise<void>) {
    if (!owner || busy) return;
    setBusy(true); setError(null); setSaved(false);
    try { await action(); if (alive.current) { setSaved(true); setRemoval(null); } }
    catch (e) { if (alive.current) setError(explain(e)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function invite() {
    const result = await clinicTeamService.invite({ email: email.trim(), role, ...(title.trim() ? { displayTitle: title.trim() } : {}) });
    if (alive.current) { setStaff(result); setEmail(""); setTitle(""); }
  }
  async function addBranch() {
    const result = await clinicTeamService.addBranch({ name: name.trim(), city: city.trim(), addressLine: address.trim(),
      ...(region.trim() ? { region: region.trim() } : {}), ...(phone.trim() ? { phone: phone.trim() } : {}),
      ...(latitude !== "" ? { latitude: Number(latitude) } : {}), ...(longitude !== "" ? { longitude: Number(longitude) } : {}),
    });
    if (alive.current) { setBranches(result); setName(""); setCity(""); setAddress(""); setRegion(""); setPhone(""); setLatitude(""); setLongitude(""); }
  }
  async function remove() {
    if (!removal) return;
    if (removal.kind === "branch") {
      const result = await clinicTeamService.removeBranch(removal.id); if (alive.current) setBranches(result);
    } else {
      const result = removal.kind === "invitation" ? await clinicTeamService.revoke(removal.id) : await clinicTeamService.removeMember(removal.id);
      if (alive.current) setStaff(result);
    }
  }
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const date = (value: string) => new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium" }).format(new Date(value));
  const staffFull = !!staff && staff.usage.limit !== null && staff.usage.used + staff.usage.pending >= staff.usage.limit;
  const branchesFull = !!branches && branches.usage.limit !== null && branches.usage.used >= branches.usage.limit;

  if (loading) return <p role="status">{t("loading")}</p>;
  if (loadFailed) return <ContextSurface><p role="alert">{t("loadFailed")}</p><Button onClick={() => setRevision(v => v + 1)}>{t("retry")}</Button></ContextSurface>;
  return <div className="space-y-5">
    <header><h2 className="text-section-title">{t(section)}</h2><p className="text-text-secondary">{t(`${section}Intro`)}</p></header>
    {saved && <p role="status">{t("saved")}</p>}

    {section === "staff" && staff && <>
      <ContextSurface><p>{t("staffUsage", { used: number(staff.usage.used), pending: number(staff.usage.pending), limit: staff.usage.limit === null ? t("unlimited") : number(staff.usage.limit) })}</p></ContextSurface>
      <div className="grid gap-3 md:grid-cols-2">{staff.items.map(member => <ContextSurface key={member.providerUserId} className="space-y-2">
        <h3 className="font-medium">{member.displayName ?? t("unnamed")}</h3><p>{t(`roles.${member.role}`)}{member.displayTitle ? ` · ${member.displayTitle}` : ""}</p>
        <p>{t("joined")} <time dateTime={member.joinedAt}>{date(member.joinedAt)}</time></p>
        {owner && member.role !== "OWNER" && <Button variant="secondary" disabled={busy} onClick={() => { setError(null); setRemoval({ kind: "member", id: member.providerUserId, name: member.displayName ?? t("unnamed") }); }}>{t("removeMember")}</Button>}
      </ContextSurface>)}</div>
      {!staff.items.length && <p>{t("emptyStaff")}</p>}
      <h3 className="text-section-title">{t("pending")}</h3>
      {!staff.pendingInvitations.length && <p>{t("emptyInvitations")}</p>}
      {staff.pendingInvitations.map(invitation => <ContextSurface key={invitation.id} className="space-y-2"><h4>{invitation.invitedDisplayName}</h4><p>{t(`roles.${invitation.role}`)}</p><p>{t("expires")} <time dateTime={invitation.expiresAt}>{date(invitation.expiresAt)}</time></p>{owner && <Button disabled={busy} variant="secondary" onClick={() => { setError(null); setRemoval({ kind: "invitation", id: invitation.id, name: invitation.invitedDisplayName }); }}>{t("revoke")}</Button>}</ContextSurface>)}
      {owner && !staffFull && <ContextSurface><form className="grid gap-3 md:grid-cols-2" onSubmit={e => { e.preventDefault(); void mutate(invite); }}>
        <Input label={t("email")} type="email" dir="ltr" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} />
        <Select label={t("role")} value={role} onChange={e => setRole(e.target.value as "VET" | "STAFF")} options={[{ value: "VET", label: t("roles.VET") }, { value: "STAFF", label: t("roles.STAFF") }]} />
        <Input label={t("displayTitle")} maxLength={80} value={title} onChange={e => setTitle(e.target.value)} />
        <p className="text-text-secondary">{t("invitationHelp")}</p>{error && !removal && <p role="alert" className="md:col-span-2">{error}</p>}<Button type="submit" disabled={busy || !email.trim()}>{t("invite")}</Button>
      </form></ContextSurface>}
      {owner && staffFull && <p>{t("limitReached")}</p>}
    </>}
    {section === "branches" && branches && <>
      <ContextSurface><p>{t("branchUsage", { used: number(branches.usage.used), limit: branches.usage.limit === null ? t("unlimited") : number(branches.usage.limit) })}</p></ContextSurface>
      <div className="grid gap-3 md:grid-cols-2">{branches.items.map(branch => <ContextSurface key={branch.id} className="space-y-2"><h3 className="font-medium">{branch.name}</h3><p>{branch.city}{branch.region ? ` · ${branch.region}` : ""}</p><p>{branch.addressLine}</p>{branch.phone && <bdi dir="ltr">{branch.phone}</bdi>}{owner && branches.items.length > 1 && <Button variant="secondary" disabled={busy} onClick={() => { setError(null); setRemoval({ kind: "branch", id: branch.id, name: branch.name }); }}>{t("removeBranch")}</Button>}</ContextSurface>)}</div>
      {!branches.items.length && <p>{t("emptyBranches")}</p>}
      {owner && !branchesFull && <ContextSurface><form className="grid gap-3 md:grid-cols-2" onSubmit={e => { e.preventDefault(); void mutate(addBranch); }}>
        <Input label={t("branchName")} required maxLength={120} value={name} onChange={e => setName(e.target.value)} />
        <Input label={t("city")} required maxLength={80} value={city} onChange={e => setCity(e.target.value)} />
        <Input label={t("address")} required minLength={3} maxLength={300} value={address} onChange={e => setAddress(e.target.value)} />
        <Input label={t("region")} maxLength={80} value={region} onChange={e => setRegion(e.target.value)} />
        <Input label={t("phone")} type="tel" dir="ltr" minLength={5} maxLength={20} value={phone} onChange={e => setPhone(e.target.value)} />
        <Input label={t("latitude")} type="number" dir="ltr" min={-90} max={90} step="any" value={latitude} onChange={e => setLatitude(e.target.value)} />
        <Input label={t("longitude")} type="number" dir="ltr" min={-180} max={180} step="any" value={longitude} onChange={e => setLongitude(e.target.value)} />
        {error && !removal && <p role="alert" className="md:col-span-2">{error}</p>}
        <Button type="submit" disabled={busy || !name.trim() || !city.trim() || address.trim().length < 3}>{t("addBranch")}</Button>
      </form></ContextSurface>}
      {owner && branchesFull && <p>{t("limitReached")}</p>}
    </>}
    <Dialog open={removal !== null} title={t("confirmTitle")} onClose={() => { if (!busy) { setRemoval(null); setError(null); } }}>
      <p>{t("confirmBody", { name: removal?.name ?? "" })}</p><p className="mt-2 text-text-secondary">{t("removalHelp")}</p>
      {error && <p role="alert">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void mutate(remove)}>{t("confirm")}</Button><Button variant="secondary" disabled={busy} onClick={() => { setRemoval(null); setError(null); }}>{t("keep")}</Button></div>
    </Dialog>
  </div>;
}
