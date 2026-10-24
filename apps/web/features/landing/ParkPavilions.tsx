"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { PawPrint, Stethoscope, Scissors, House, Plane, CarFront, HandHeart, ShieldCheck } from "@petlife/ui";
import type { AppLocale } from "@/lib/i18n/config";
import { parkCopy, parkDestinations } from "./park-copy";

const icons = { shop: PawPrint, vet: Stethoscope, grooming: Scissors, boarding: House, travel: Plane, taxi: CarFront, support: HandHeart, insurance: ShieldCheck };
// Physical sign icon centers, as percentages of the existing pavilion hit region.
const iconTop = { shop: 12, vet: 20, grooming: 14, boarding: 17, travel: 18, taxi: 20, support: 21, insurance: 13 };

export function ParkPavilions({ locale }: { locale: AppLocale }) {
  const ref = useRef<HTMLElement>(null);
  const [intro, setIntro] = useState(false);
  const c = parkCopy[locale];
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      setIntro(true);
      timer = setTimeout(() => setIntro(false), 2600);
      observer.disconnect();
    }, { threshold: 0.35 });
    observer.observe(ref.current);
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, []);
  return <nav ref={ref} className="park-pavilions" data-intro={intro} aria-label={c.destinationsLabel}>
    {parkDestinations.map((destination, index) => {
      const Icon = icons[destination.key];
      return <Link key={destination.key} href={`/${locale}${destination.href}`} className={`park-pavilion park-tone-${destination.tone}`} style={{ left: `${destination.x}%`, top: `${destination.y}%`, width: `${destination.width}%` }} aria-label={c.services[destination.key].title}>
        <Icon className="park-pavilion__light" aria-hidden="true" style={{ left: destination.key === "shop" ? "56%" : "50%", top: `${iconTop[destination.key]}%`, "--park-light-delay": `${index * 200}ms` } as CSSProperties} />
        <span>{c.services[destination.key].title}</span>
      </Link>;
    })}
  </nav>;
}
