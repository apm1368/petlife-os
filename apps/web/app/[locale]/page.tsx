import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAppLocale } from "@/lib/i18n/config";
import { HomeLanding } from "@/features/landing/HomeLanding";
import "@/features/landing/landing.css";
import "@/features/landing/home-landing.css";
import "@/features/landing/park-landing.css";
import { landingCopy } from "@/features/landing/copy";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  return { title: `PET LIFE OS — ${landingCopy[locale].meta.title}`, description: landingCopy[locale].meta.description };
}

export default async function RootPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  return <HomeLanding locale={locale} />;
}
