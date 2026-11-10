import type { Metadata } from "next";
import { TravelHomeView } from "@/features/travel-market/TravelHomeView";
import { isRouteLocale, locales } from "@/lib/i18n/config";

const copy = {
  fa: { title: "سفر و اقامت با حیوان خانگی | opetlife", description: "اقامتگاه‌های مناسب حیوان خانگی را کشف کنید. پیش از رزرو، قیمت، ظرفیت و قوانین پذیرش حیوان را در منبع تأیید کنید." },
  en: { title: "Pet-friendly travel and stays | opetlife", description: "Discover pet-friendly stays. Confirm the price, availability and pet rules with the source before booking." },
  de: { title: "Reisen und Unterkünfte mit Haustier | opetlife", description: "Entdecken Sie haustierfreundliche Unterkünfte. Bestätigen Sie Preis, Verfügbarkeit und Haustierregeln vor der Buchung bei der Quelle." },
  es: { title: "Viajes y alojamientos con mascotas | opetlife", description: "Descubre alojamientos que admiten mascotas. Confirma el precio, la disponibilidad y las normas sobre mascotas en la fuente antes de reservar." },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const language = isRouteLocale(locale) ? locale : "fa";
  return {
    ...copy[language],
    alternates: { canonical: `/${language}/travel`, languages: Object.fromEntries(locales.map((value) => [value, `/${value}/travel`])) },
  };
}

export default function TravelHomePage() {
  return <TravelHomeView />;
}
