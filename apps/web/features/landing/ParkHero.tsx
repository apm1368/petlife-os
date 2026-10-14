import Link from "next/link";
import Image from "next/image";
import { PawPrint, ShoppingBag, Stethoscope, Scissors, House, Plane, CarFront, HandHeart, ShieldCheck } from "@petlife/ui";
import type { AppLocale } from "@/lib/i18n/config";
import { parkCopy, parkDestinations } from "./park-copy";

const icons = { shop: ShoppingBag, vet: Stethoscope, grooming: Scissors, boarding: House, travel: Plane, taxi: CarFront, support: HandHeart, insurance: ShieldCheck };

export function ParkHero({ locale }: { locale: AppLocale }) {
  const c = parkCopy[locale];
  return <>
    <section className="park-hero" aria-labelledby="park-title">
      <div className="park-scene">
        <Image unoptimized priority className="park-scene__image" src={c.imageSrc} alt={c.imageAlt} width={1681} height={936} />
        <div className="park-hero__copy">
          <h1 id="park-title">{c.title}</h1>
          <p className="park-hero__description">{c.description}</p>
          <p className="park-hero__subline">{c.subline}</p>
          <a href={`/${locale}#park-services`} className="park-primary"><PawPrint size={19} aria-hidden="true" />{c.explore}</a>
        </div>
        <nav className="park-pavilions" aria-label={c.destinationsLabel}>
          {parkDestinations.map(destination => <Link key={destination.key} href={`/${locale}${destination.href}`} className={`park-pavilion park-tone-${destination.tone}`} style={{ left: `${destination.x}%`, top: `${destination.y}%`, width: `${destination.width}%` }} aria-label={c.services[destination.key].title}>
            <span>{c.services[destination.key].title}</span>
          </Link>)}
        </nav>
      </div>
    </section>
    <section id="park-services" className="park-intro" aria-labelledby="park-intro-title">
      <h2 id="park-intro-title">{c.introTitle}</h2>
      <p>{c.introBody}</p>
      <nav aria-label={c.destinationsLabel} className="park-services">
        {parkDestinations.map(destination => {
          const Icon = icons[destination.key];
          const service = c.services[destination.key];
          return <Link key={destination.key} href={`/${locale}${destination.href}`} className={`park-service park-tone-${destination.tone}`}>
            <span className="park-service__icon"><Icon size={27} strokeWidth={1.8} aria-hidden="true" /></span>
            <strong>{service.title}</strong><small>{service.hint}</small>
          </Link>;
        })}
      </nav>
    </section>
  </>;
}
