import { isRouteLocale, locales } from "@/lib/i18n/config";
import { buildManifest } from "@/lib/pwa/manifest";

export const dynamic = "force-static";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

/** Web app manifest per language: /fa/manifest.webmanifest, /en/manifest.webmanifest, … (linked from the locale layout). */
export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isRouteLocale(locale)) return new Response("Not found", { status: 404 });
  return new Response(JSON.stringify(buildManifest(locale)), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
