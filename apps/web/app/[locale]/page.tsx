import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAppLocale } from "@/lib/i18n/config";
import { LandingPage } from "@/features/landing/LandingPage";
import { landingCopy } from "@/features/landing/copy";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  return { title: `PET LIFE OS — ${landingCopy[locale].title}`, description: landingCopy[locale].intro };
}

export default async function RootPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  return <LandingPage locale={locale} />;
}
