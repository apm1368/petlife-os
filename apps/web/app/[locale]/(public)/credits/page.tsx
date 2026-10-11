import credits from "@/features/landing/photo-credits.json";

/** Photo credits — every third-party photograph we publish, its author and licence (CC BY / CC BY-SA require it). */
export default async function CreditsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const fa = locale !== "en";
  return (
    <div className="flex flex-col gap-6">
      <header className="section-head">
        <div>
          <h1>{fa ? "اعتبار عکس‌ها" : "Photo credits"}</h1>
          <p>{fa ? "عکس‌های سایت از Wikimedia Commons با مجوز آزاد هستند؛ عکس «کوکی» متعلق به صاحب خودش است." : "Site photos come from Wikimedia Commons under free licences; Cookie's photo belongs to her owner."}</p>
        </div>
      </header>
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
          </li>
        ))}
      </ul>
    </div>
  );
}
