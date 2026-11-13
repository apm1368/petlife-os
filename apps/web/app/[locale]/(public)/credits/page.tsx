import { isRouteLocale } from "@/lib/i18n/config";
import { notFound } from "next/navigation";
import { ParkCredits } from "@/features/landing/ParkCredits";
import { getTranslations } from "next-intl/server";
import type { ParkText } from "@/features/landing/park-copy";
import credits from "@/features/landing/photo-credits.json";
import { publicPageMetadata } from "@/lib/seo/public-metadata";
import { REEL_TRACK, VIDEO_REEL_TRACK } from "@/features/reel/reel-track";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicPageMetadata((await params).locale, "credits");
}

/** Credits — every third-party photograph and the reel soundtrack we publish, with author and licence, in every site language. */
export default async function CreditsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isRouteLocale(locale)) notFound();
  const park = (await getTranslations({ locale, namespace: "pattern2026" })).raw("park") as ParkText;
  return (
    <div className="flex flex-col gap-6">
      <header className="section-head">
        <div>
          <h1>{park.photoCredits}</h1>

        </div>
      </header>
      <ParkCredits locale={locale} />
      <ul className="row-list">
        {(credits as { file: string; title: string; page: string; author: string; license: string; licenseUrl: string | null }[]).map((c) => (
          <li key={c.file}>
            <a className="row-list__item" href={c.page} target="_blank" rel="noopener noreferrer">
              <span className="flex min-w-0 items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.file} alt="" width={72} height={48} className="h-12 w-[72px] shrink-0 rounded-md object-cover" loading="lazy" />
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold" dir="ltr">{c.title}</span>
                  <span className="text-metadata text-text-secondary" dir="ltr">{c.author || "—"} · {c.license}</span>
                </span>
              </span>
            </a>
            <p className="px-4 pb-4 text-metadata text-text-secondary">
              {park.processing}{" · "}
              <a href={c.licenseUrl ?? "https://creativecommons.org/publicdomain/mark/1.0/"} target="_blank" rel="noopener noreferrer" className="underline">{park.licence}</a>
            </p>
          </li>
        ))}
      </ul>
      <section className="flex flex-col gap-3" aria-labelledby="music-credits-title">
        <h2 id="music-credits-title" className="text-section-title">{park.musicTitle}</h2>
        <ul className="row-list">
          {[
            { track: REEL_TRACK, usage: park.musicUsage },
            { track: VIDEO_REEL_TRACK, usage: park.musicUsageVideo },
          ].map(({ track, usage }) => (
            <li key={track.page}>
              <a className="row-list__item" href={track.page} target="_blank" rel="noopener noreferrer">
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold" dir="ltr">{track.title} · {track.album}</span>
                  <span className="text-metadata text-text-secondary" dir="ltr">{track.author} · {track.license}</span>
                </span>
              </a>
              <p className="px-4 pb-4 text-metadata text-text-secondary">
                {usage}{" · "}
                <a href={track.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline">{park.licence}</a>
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
