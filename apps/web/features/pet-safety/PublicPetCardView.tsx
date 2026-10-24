"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { EmptyState, Skeleton } from "@petlife/ui";
import { petSafetyService, type PublicPetCardDto } from "@/services/pet-safety.service";

/** Functional only (Codex owns the design): what a QR scan / emergency link shows. Never the full health record. */
export function PublicPetCardView({ token }: { token: string }) {
  const locale = useLocale() === "en" ? "en" : "fa";
  const fa = locale === "fa";
  const [card, setCard] = useState<PublicPetCardDto | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    petSafetyService.publicCard(token).then(setCard).catch(() => setMissing(true));
  }, [token]);

  if (missing) return <EmptyState title={fa ? "این کارت در دسترس نیست" : "This card isn't available"} description={fa ? "ممکن است منقضی یا لغو شده باشد." : "It may have expired or been revoked."} />;
  if (!card) return <Skeleton className="h-64 w-full" />;
  const contact = card.emergencyContact;
  return (
    <article className="pet-card" aria-labelledby="pet-card-name">
      {/* eslint-disable-next-line @next/next/no-img-element -- owner-uploaded photo served from storage, not a static asset */}
      {card.photoUrl ? <img src={card.photoUrl} alt="" width={160} height={160} /> : null}
      <h1 id="pet-card-name">{card.name}</h1>
      <p>{[card.species, card.breed, card.sex].filter(Boolean).join(" · ")}</p>
      {card.microchipNumber ? <p dir="ltr">{fa ? "میکروچیپ: " : "Microchip: "}{card.microchipNumber}</p> : null}
      {card.isReportedLost && card.lostIncidentId ? <p role="status"><Link href={`/${locale}/lost-pets/${card.lostIncidentId}`}>{fa ? "این پت گم‌شده گزارش شده است — مشاهده و اطلاع‌رسانی" : "This pet is reported lost — view and report a sighting"}</Link></p> : null}
      {card.kind === "EMERGENCY" ? (
        <section aria-label={fa ? "اطلاعات اضطراری" : "Emergency information"}>
          <h2>{fa ? "حساسیت‌ها" : "Allergies"}</h2>
          <ul>{(card.allergies ?? []).map((a) => <li key={a.name}>{a.name}{a.reaction ? ` — ${a.reaction}` : ""}</li>)}</ul>
          <h2>{fa ? "بیماری‌های فعال" : "Active conditions"}</h2>
          <ul>{(card.activeConditions ?? []).map((c) => <li key={c}>{c}</li>)}</ul>
          <h2>{fa ? "داروهای فعلی" : "Current medications"}</h2>
          <ul>{(card.activeMedications ?? []).map((m) => <li key={m.name}>{[m.name, m.dosage && `${m.dosage} ${m.unit ?? ""}`, m.frequency].filter(Boolean).join(" · ")}</li>)}</ul>
          {card.bloodType ? <p>{fa ? "گروه خونی: " : "Blood type: "}{card.bloodType}</p> : null}
          {card.criticalNotes ? <p>{card.criticalNotes}</p> : null}
        </section>
      ) : null}
      {contact ? <p>{fa ? "تماس اضطراری: " : "Emergency contact: "}{contact.name ? `${contact.name} — ` : ""}<a href={`tel:${contact.phone}`} dir="ltr">{contact.phone}</a></p> : null}
    </article>
  );
}
