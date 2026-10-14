import { isAppLocale } from "@/lib/i18n/config";
import { notFound } from "next/navigation";
import { ParkCredits } from "@/features/landing/ParkCredits";
import { parkCopy } from "@/features/landing/park-copy";
import credits from "@/features/landing/photo-credits.json";

/** Photo credits — every third-party photograph we publish, its author and licence (CC BY / CC BY-SA require it). */
export default async function CreditsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const c = parkCopy[locale];
  return (
    <div className="flex flex-col gap-6">
      <header className="section-head">
        <div>
          <h1>{c.photoCredits}</h1>

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
              {parkCopy[locale].processing}{" · "}
              <a href={c.licenseUrl ?? "https://creativecommons.org/publicdomain/mark/1.0/"} target="_blank" rel="noopener noreferrer" className="underline">{parkCopy[locale].licence}</a>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
