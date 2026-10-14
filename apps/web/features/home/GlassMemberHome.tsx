"use client";

import Link from "next/link";
import type { PetDto, PetOverviewDto } from "@petlife/types";
import { Avatar, Bell, CalendarDays, ChevronLeft, ChevronRight, FileText, HeartPulse, Images, PawPrint, Plus, StatusLabel } from "@petlife/ui";
import { formatAge, speciesLabel } from "@/features/pets/pet-identity";
import { attentionTitle, eventTitle, formatOverviewDate, severityLabel, severityTone } from "@/features/pets/overview-labels";
import type { usePetAccess } from "@/hooks/use-pet-access";
import { glassHomeCopy } from "./glass-home-copy";
import "./glass-member-home.css";

type Locale = "fa" | "en";
export function GlassMemberHome({ locale, userName, pet, overview, pets, activePetId, onSwitch, permission, isSwitching, careFailed, onRetryCare }: {
  locale: Locale; userName: string | null; pet: PetDto; overview: PetOverviewDto;
  pets: PetDto[]; activePetId: string | null; permission: ReturnType<typeof usePetAccess>; isSwitching: boolean; careFailed: boolean; onRetryCare: () => void; onSwitch: (id: string) => void;
}) {
  const c = glassHomeCopy[locale];
  const base = `/${locale}/pets/${pet.id}`;
  const Forward = locale === "fa" ? ChevronLeft : ChevronRight;
  const count = (n: number) => new Intl.NumberFormat(locale).format(n);
  const sections = [
    { href: `${base}/health`, label: c.health, Icon: HeartPulse },
    { href: `${base}/care`, label: c.care, Icon: CalendarDays },
    { href: base, label: c.profile, Icon: PawPrint },
    { href: `${base}/memories`, label: c.memories, Icon: Images },
    { href: `${base}/health/documents`, label: c.documents, Icon: FileText },
    { href: `${base}/travel`, label: c.travel, Icon: CalendarDays },
  ].filter(section => section.href === `${base}/health` || section.href === `${base}/health/documents` ? permission.access?.canViewHealth : section.href === `${base}/care` ? permission.access?.canViewCareProfile : true);
  return <section className="glass-home" aria-label={c.identity}>
    <header className="glass-home__greeting">
      <div><p className="glass-home__eyebrow">PET LIFE OS</p><h2>{c.greeting}{userName ? c.nameSeparator + userName : ""}</h2><p>{c.subtitle}</p></div>
      <div className="glass-home__summary"><Bell size={22} aria-hidden="true" /><strong>{count(overview.upcoming.length)}</strong><span>{c.reminders}</span></div>
      <div className="glass-home__switch"><label htmlFor="glass-pet">{c.choose}</label><select id="glass-pet" disabled={isSwitching} value={activePetId ?? pet.id} onChange={e => onSwitch(e.target.value)}>{pets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><Link href={`/${locale}/pets/new`}><Plus size={17} aria-hidden="true" />{c.add}</Link></div>
    </header>
    <div className="glass-home__grid">
      <aside className="glass-home__identity glass-panel">
        <div className="glass-home__pet"><Avatar name={pet.name} src={pet.photoUrl ?? undefined} size="lg" /><div><h2>{pet.name}</h2><p>{[speciesLabel(pet, locale), pet.breed].filter(Boolean).join(" · ")} <span>{formatAge(pet, locale, "")}</span></p></div></div>
        {permission.error ? <p role="alert">{c.accessError} <button type="button" onClick={permission.retry}>{c.retry}</button></p> : null}
        <nav className="glass-home__sections" aria-label={c.profile}>{sections.map(({ href, label, Icon }) => <Link key={href} href={href}><Icon size={22} aria-hidden="true" /><span>{label}</span></Link>)}</nav>
        <section className="glass-home__attention" aria-labelledby="home-attention"><h2 id="home-attention">{c.attention}</h2>
          {overview.attention.length ? <ul>{overview.attention.slice(0, 4).map(item => <li key={item.id}><Link href={base + item.href}><span><strong>{attentionTitle(item.title, locale)}</strong>{item.dueAt ? <small>{formatOverviewDate(item.dueAt, locale)}</small> : null}</span>{item.severity !== "ATTENTION" ? <StatusLabel tone={severityTone(item.severity)}>{severityLabel(item.severity, locale)}</StatusLabel> : null}<Forward size={16} aria-hidden="true" /></Link></li>)}</ul> : <div><p>{c.noAttention}</p><p className="glass-home__hint">{c.attentionHint}</p></div>}
        </section>
      </aside>
      <section className="glass-home__calendar glass-panel" aria-labelledby="home-upcoming"><header><div><h2 id="home-upcoming">{c.calendar}</h2><p>{c.upcoming}</p></div><CalendarDays size={24} aria-hidden="true" /></header>
        {careFailed && overview.upcoming.length > 0 ? <p role="status">{c.careError} <button type="button" onClick={onRetryCare}>{c.retry}</button></p> : null}
        {overview.upcoming.length ? <ol>{overview.upcoming.slice(0, 5).map((item, i) => <li key={`${item.type}-${item.id}`} data-tone={i % 3}><Link href={item.href.startsWith("/bookings/") ? `/${locale}${item.href}` : base + item.href}><CalendarDays size={21} aria-hidden="true" /><div><strong>{eventTitle(item.title, locale)}</strong><time dateTime={item.occurredAt}>{formatOverviewDate(item.occurredAt, locale)}</time>{item.providerName ? <small>{item.providerName}</small> : null}</div><Forward size={18} aria-hidden="true" /></Link></li>)}</ol> : <div className="glass-home__empty"><p>{careFailed ? c.careError : c.empty}</p>{careFailed ? <button type="button" onClick={onRetryCare}>{c.retry}</button> : null}</div>}
        {permission.access?.canViewCareProfile ? <Link className="glass-home__calendar-link" href={`${base}/care`}>{c.calendarLink}<Forward size={18} aria-hidden="true" /></Link> : null}
      </section>
    </div>
  </section>;
}
