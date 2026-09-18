import { LandingView } from "@/features/landing/LandingView";

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <LandingView locale={locale} />;
}
