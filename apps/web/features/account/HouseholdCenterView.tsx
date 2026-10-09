"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { Avatar, Button, ContextSurface, Dialog, EmptyState, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import { householdsService } from "@/services/households.service";
import type { HouseholdCollaborationDto } from "@/services/account.service";
import type { HouseholdDto } from "@petlife/types";
import { useRouter } from "next/navigation";
import { AccountPageHeader } from "./AccountNav";

export function HouseholdCenterView() {
  const locale = useLocale(); const router = useRouter();
  const [households, setHouseholds] = useState<HouseholdDto[]>([]); const [selectedId, setSelectedId] = useState("");
  const [data, setData] = useState<HouseholdCollaborationDto | null>(null); const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false); const [contact, setContact] = useState(""); const [presets, setPresets] = useState<Record<string,"VIEW_ONLY"|"CARE_HELPER"|"FULL">>({}); const [busy, setBusy] = useState(false); const [deliveryNotice, setDeliveryNotice] = useState("");
  const loadList = useCallback(async () => { const list = await householdsService.listMine(); setHouseholds(list); setSelectedId((current) => current || list[0]?.id || ""); setLoading(false); }, []);
  const loadDetail = useCallback(async () => { if (!selectedId) return setData(null); setData(await householdsService.collaboration(selectedId)); }, [selectedId]);
  useEffect(() => { void loadList(); }, [loadList]); useEffect(() => { void loadDetail(); }, [loadDetail]);
  const memberAccess = useMemo(() => {
    if (!data) return new Map<string,string[]>();
    const now = Date.now(); const map = new Map<string,string[]>();
    for (const member of data.members) {
      const petNames = data.pets.filter((pet) => data.grants.some((grant) => grant.userId === member.userId && grant.petId === pet.id && (!grant.startsAt || new Date(grant.startsAt).getTime() <= now) && (!grant.expiresAt || new Date(grant.expiresAt).getTime() > now))).map((pet) => pet.name);
      map.set(member.userId, petNames);
    }
    return map;
  }, [data]);
  async function sendInvite() {
    if (!data || !contact.trim()) return; setBusy(true);
    try {
      const result = await householdsService.invite(data.id, { contact: contact.trim(), initialAccess: data.pets.map((pet) => ({ petId: pet.id, preset: presets[pet.id] || "VIEW_ONLY" })) });
      setDeliveryNotice(result.delivery === "DELIVERED"
        ? (locale === "fa" ? "دعوت امن داخل پت‌لایف ارسال شد." : "The secure in-app invitation was delivered.")
        : (locale === "fa" ? "دعوت ذخیره شد، اما ارسال بیرونی هنوز متصل نیست؛ از عضو بخواهید ابتدا با همین ایمیل یا موبایل حساب بسازد." : "Invitation saved, but external delivery is not connected yet. Ask the member to create an account with this email or phone."));
      setInviteOpen(false); setContact(""); await loadDetail();
    } finally { setBusy(false); }
  }
  async function invitationAction(id:string, action:"resend"|"cancel") { if(!data)return; setBusy(true); try{ if(action==="resend") await householdsService.resendInvitation(data.id,id); else await householdsService.cancelInvitation(data.id,id); await loadDetail(); }finally{setBusy(false)} }
  if (loading) return <Skeleton className="h-96 w-full" aria-label="loading" />;
  if (!households.length) return <div className="account-stack"><AccountPageHeader eyebrow={locale==="fa"?"خانواده":"HOUSEHOLD"} title={locale==="fa"?"همکاری امن برای مراقبت":"Care together, securely"} description={locale==="fa"?"هر فرد حساب خودش را دارد و دسترسی هر حیوان جداگانه تعیین می‌شود.":"Everyone keeps their own account and each pet''s access is explicit."}/><EmptyState title={locale==="fa"?"هنوز خانواده‌ای ندارید":"No household yet"} description={locale==="fa"?"ابتدا در مسیر افزودن حیوان، خانهٔ خود را ایجاد کنید.":"Create your home while adding your first pet."} actionLabel={locale==="fa"?"شروع راه‌اندازی":"Start setup"} onAction={()=>router.push(`/${locale}/onboarding`)}/></div>;
  if (!data) return <Skeleton className="h-96 w-full" aria-label="loading" />;
  const isOwner=data.currentUserRole==="OWNER";
  return <div className="account-stack">
    <AccountPageHeader eyebrow={locale==="fa"?"خانواده و دسترسی":"HOUSEHOLD & ACCESS"} title={data.name || (locale==="fa"?"خانهٔ من":"My household")} description={locale==="fa"?"عضویت در خانواده به معنی دسترسی کامل به اطلاعات حیوان نیست؛ هر دسترسی شفاف و قابل لغو است.":"Household membership never means automatic full pet access; every grant is explicit and reversible."}/>
    {deliveryNotice&&<div className="account-notice" role="status">{deliveryNotice}</div>}
    {households.length>1&&<Select label={locale==="fa"?"خانواده":"Household"} value={selectedId} onChange={(e)=>setSelectedId(e.target.value)} options={households.map((h)=>({value:h.id,label:h.name||h.id.slice(0,8)}))}/>}
    <section><div className="account-section-title"><div><h2>{locale==="fa"?"اعضا":"Members"}</h2><p>{locale==="fa"?"هر عضو با حساب مستقل وارد می‌شود.":"Every member signs in with an independent account."}</p></div>{isOwner&&<Button onClick={()=>setInviteOpen(true)}>{locale==="fa"?"دعوت عضو":"Invite member"}</Button>}</div>
      <div className="member-list">{data.members.map((member)=><div className="member-row" key={member.id}><Avatar name={member.user.displayName} src={member.user.avatarUrl} size="sm"/><div><b>{member.user.displayName}</b><p>{memberAccess.get(member.userId)?.length ? (locale==="fa"?`دسترسی به ${memberAccess.get(member.userId)!.join("، ")}`:`Access to ${memberAccess.get(member.userId)!.join(", ")}`):(locale==="fa"?"بدون دسترسی فعال به حیوان":"No active pet access")}</p></div><StatusLabel tone={member.role==="OWNER"?"success":"neutral"}>{member.role==="OWNER"?(locale==="fa"?"مدیر":"Organizer"):(locale==="fa"?"عضو":"Member")}</StatusLabel></div>)}</div>
    </section>
    {data.invitations.length>0&&<section><div className="account-section-title"><h2>{locale==="fa"?"دعوت‌های در انتظار":"Pending invitations"}</h2></div><div className="security-list">{data.invitations.map((invite)=><div className="security-row" key={invite.id}><div className="security-row__icon">✉</div><div><b>{invite.contactMasked}</b><p>{locale==="fa"?"انقضا": "Expires"}: {new Intl.DateTimeFormat(locale,{dateStyle:"medium"}).format(new Date(invite.expiresAt))}</p></div>{isOwner&&<div className="flex gap-1"><Button variant="ghost" size="sm" disabled={busy} onClick={()=>invitationAction(invite.id,"resend")}>{locale==="fa"?"ارسال دوباره":"Resend"}</Button><Button variant="ghost" size="sm" disabled={busy} onClick={()=>invitationAction(invite.id,"cancel")}>{locale==="fa"?"لغو":"Cancel"}</Button></div>}</div>)}</div></section>}
    <section><div className="account-section-title"><div><h2>{locale==="fa"?"دسترسی حیوانات":"Pet access"}</h2><p>{locale==="fa"?"مجوزهای سلامت، مراقبت و رزرو را برای هر حیوان جداگانه مدیریت کنید.":"Manage health, care and booking permissions per pet."}</p></div></div><div className="pet-access-cards">{data.pets.map((pet)=><ContextSurface key={pet.id} className="pet-access-card"><div className="pet-access-avatar">{pet.photoUrl?<img src={pet.photoUrl} alt=""/>:pet.name.slice(0,1)}</div><div><b>{pet.name}</b><p>{pet.lifecycleStatus}</p></div>{isOwner&&<Button variant="secondary" size="sm" onClick={()=>router.push(`/${locale}/profile/household/pets/${pet.id}/access`)}>{locale==="fa"?"مدیریت دسترسی":"Manage access"}</Button>}<Button variant="ghost" size="sm" onClick={()=>router.push(`/${locale}/profile/household/pets/${pet.id}/lifecycle`)}>{locale==="fa"?"وضعیت زندگی":"Lifecycle"}</Button></ContextSurface>)}</div></section>
    <section><div className="account-section-title"><div><h2>{locale==="fa"?"تاریخچهٔ دسترسی":"Access history"}</h2><p>{locale==="fa"?"دعوت‌ها، تغییر مجوز و پایان دسترسی موقت.":"Invitations, permission changes and temporary access expiry."}</p></div></div>{data.history.length?<div className="security-list">{data.history.map((event)=><div className="security-row" key={event.id}><div className="security-row__icon">↻</div><div><b>{event.type}</b><p>{new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short"}).format(new Date(event.occurredAt))}</p></div></div>)}</div>:<p className="text-body-sm text-text-secondary">{locale==="fa"?"هنوز رویدادی ثبت نشده است.":"No access events yet."}</p>}</section>
    <Dialog open={inviteOpen} onClose={()=>setInviteOpen(false)} title={locale==="fa"?"دعوت به خانواده":"Invite to household"}><div className="flex flex-col gap-4"><Input label={locale==="fa"?"ایمیل یا موبایل":"Email or phone"} value={contact} onChange={(e)=>setContact(e.target.value)} autoFocus/><p className="text-metadata text-text-secondary">{locale==="fa"?"دسترسی اولیه را برای هر حیوان مشخص کنید. دعوت‌شونده قبل از پذیرش خلاصهٔ دسترسی را می‌بیند.":"Choose initial access for each pet. The invitee sees a summary before accepting."}</p>{data.pets.map((pet)=><Select key={pet.id} label={pet.name} value={presets[pet.id]||"VIEW_ONLY"} onChange={(e)=>setPresets({...presets,[pet.id]:e.target.value as "VIEW_ONLY"|"CARE_HELPER"|"FULL"})} options={[{value:"VIEW_ONLY",label:locale==="fa"?"فقط مشاهده":"View only"},{value:"CARE_HELPER",label:locale==="fa"?"همیار مراقبت":"Care helper"},{value:"FULL",label:locale==="fa"?"دسترسی کامل خانوادگی":"Full household access"}]}/>)}<div className="flex gap-2"><Button isLoading={busy} disabled={!contact.trim()} onClick={sendInvite}>{locale==="fa"?"ارسال دعوت":"Send invite"}</Button><Button variant="ghost" onClick={()=>setInviteOpen(false)}>{locale==="fa"?"انصراف":"Cancel"}</Button></div></div></Dialog>
  </div>;
}
