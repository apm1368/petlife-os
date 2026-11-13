import { notFound } from "next/navigation";
import { isRouteLocale } from "@/lib/i18n/config";
import { publicPageMetadata } from "@/lib/seo/public-metadata";
import { SetPetView } from "@/features/set-pet/SetPetView";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicPageMetadata((await params).locale, "setPet");
}

/** /set-pet — «ست پت»: matching custom-printed shirts for a member and their pet (explanation, builder, requests). */
export default async function SetPetPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isRouteLocale(locale)) notFound();
  return <SetPetView locale={locale} />;
}
