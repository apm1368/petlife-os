"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { EmptyState, Skeleton } from "@petlife/ui";
import { petSafetyService, type PublicPetCardDto } from "@/services/pet-safety.service";

const COPY = {
  fa: { unavailable: "این کارت در دسترس نیست", unavailableHint: "ممکن است منقضی یا لغو شده باشد.", microchip: "میکروچیپ: ", lost: "این پت گم‌شده گزارش شده است — مشاهده و اطلاع‌رسانی", emergency: "اطلاعات اضطراری", allergies: "حساسیت‌ها", conditions: "بیماری‌های فعال", medications: "داروهای فعلی", bloodType: "گروه خونی: ", contact: "تماس اضطراری: " },
  en: { unavailable: "This card isn't available", unavailableHint: "It may have expired or been revoked.", microchip: "Microchip: ", lost: "This pet is reported lost — view and report a sighting", emergency: "Emergency information", allergies: "Allergies", conditions: "Active conditions", medications: "Current medications", bloodType: "Blood type: ", contact: "Emergency contact: " },
  de: { unavailable: "Diese Karte ist nicht verfügbar", unavailableHint: "Sie ist möglicherweise abgelaufen oder wurde widerrufen.", microchip: "Mikrochip: ", lost: "Dieses Tier wurde als vermisst gemeldet – ansehen und eine Sichtung melden", emergency: "Notfallinformationen", allergies: "Allergien", conditions: "Aktuelle Erkrankungen", medications: "Aktuelle Medikamente", bloodType: "Blutgruppe: ", contact: "Notfallkontakt: " },
  es: { unavailable: "Esta tarjeta no está disponible", unavailableHint: "Puede que haya caducado o se haya revocado.", microchip: "Microchip: ", lost: "Esta mascota está reportada como perdida: ver y avisar de un avistamiento", emergency: "Información de emergencia", allergies: "Alergias", conditions: "Enfermedades activas", medications: "Medicación actual", bloodType: "Grupo sanguíneo: ", contact: "Contacto de emergencia: " },
} as const;

/** Functional only (Codex owns the design): what a QR scan / emergency link shows. Never the full health record. */
export function PublicPetCardView({ token }: { token: string }) {
  const locale = useLocale() as keyof typeof COPY;
  const c = COPY[locale] ?? COPY.en;
  const [card, setCard] = useState<PublicPetCardDto | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    petSafetyService.publicCard(token).then(setCard).catch(() => setMissing(true));
  }, [token]);

  if (missing) return <EmptyState title={c.unavailable} description={c.unavailableHint} />;
  if (!card) return <Skeleton className="h-64 w-full" />;
  const contact = card.emergencyContact;
  return (
    <article className="pet-card" aria-labelledby="pet-card-name">
      {/* eslint-disable-next-line @next/next/no-img-element -- owner-uploaded photo served from storage, not a static asset */}
      {card.photoUrl ? <img src={card.photoUrl} alt="" width={160} height={160} /> : null}
      <h1 id="pet-card-name">{card.name}</h1>
      <p>{[card.species, card.breed, card.sex].filter(Boolean).join(" · ")}</p>
      {card.microchipNumber ? <p dir="ltr">{c.microchip}{card.microchipNumber}</p> : null}
      {card.isReportedLost && card.lostIncidentId ? <p role="status"><Link href={`/${locale}/lost-pets/${card.lostIncidentId}`}>{c.lost}</Link></p> : null}
      {card.kind === "EMERGENCY" ? (
        <section aria-label={c.emergency}>
          <h2>{c.allergies}</h2>
          <ul>{(card.allergies ?? []).map((a) => <li key={a.name}>{a.name}{a.reaction ? ` — ${a.reaction}` : ""}</li>)}</ul>
          <h2>{c.conditions}</h2>
          <ul>{(card.activeConditions ?? []).map((c) => <li key={c}>{c}</li>)}</ul>
          <h2>{c.medications}</h2>
          <ul>{(card.activeMedications ?? []).map((m) => <li key={m.name}>{[m.name, m.dosage && `${m.dosage} ${m.unit ?? ""}`, m.frequency].filter(Boolean).join(" · ")}</li>)}</ul>
          {card.bloodType ? <p>{c.bloodType}{card.bloodType}</p> : null}
          {card.criticalNotes ? <p>{card.criticalNotes}</p> : null}
        </section>
      ) : null}
      {contact ? <p>{c.contact}{contact.name ? `${contact.name} — ` : ""}<a href={`tel:${contact.phone}`} dir="ltr">{contact.phone}</a></p> : null}
    </article>
  );
}
