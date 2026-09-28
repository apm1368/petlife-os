import type { Metadata } from "next";
import { TravelHomeView } from "@/features/travel-market/TravelHomeView";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const fa = locale === "fa";
  return {
    title: fa ? "سفر و اقامت با حیوان خانگی | PET LIFE" : "Pet-friendly travel and stays | PET LIFE",
    description: fa ? "اقامتگاه‌هایی که حیوان شما را می‌پذیرند، با قوانین حیوانات اعلام‌شدهٔ هر اقامتگاه و موجودی واقعی." : "Stays that welcome your pet, with each property's stated pet rules and real availability.",
    alternates: { languages: { fa: "/fa/travel", en: "/en/travel" } },
  };
}

export default function TravelHomePage() {
  return <TravelHomeView />;
}
