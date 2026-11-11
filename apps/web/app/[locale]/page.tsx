import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isRouteLocale } from "@/lib/i18n/config";
import { HomeLanding } from "@/features/landing/HomeLanding";
import "@/features/landing/park-landing.css";
import "@/features/landing/park-story.css";
import "@/features/landing/opl/opl-landing.css";
import "@/features/reel/reel.css";
import { publicPageMetadata } from "@/lib/seo/public-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isRouteLocale(locale)) notFound();
  return publicPageMetadata(locale, "home");
}

export default async function RootPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isRouteLocale(locale)) notFound();
  return <HomeLanding locale={locale} />;
}
