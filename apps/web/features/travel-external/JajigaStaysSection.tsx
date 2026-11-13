"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, Skeleton } from "@petlife/ui";
import { travelExternalService, type ExternalStay, type ExternalStayContext } from "@/services/travel-external.service";
import { ExternalStayCard } from "./ExternalStayCard";

/** The external source whose pet-accepting stays are synced daily (facts only, click-out). */
export const JAJIGA_SOURCE = "JAJIGA";

/**
 * Jajiga's pet-accepting stays shown next to opetlife's own listings (travel home and search). Facts only, exactly as
 * ExternalStayCard shows them; every card says where it comes from and leaves through the logged /out redirect — there
 * is no booking or fee on opetlife for these.
 */
export function JajigaStaysSection({
  city,
  context = {},
  pageSize = 6,
  page = 1,
  onPage,
  seeAllHref,
  hideWhenEmpty = false,
  headingLevel = 2,
}: {
  city?: string;
  context?: ExternalStayContext;
  pageSize?: number;
  page?: number;
  onPage?: (page: number) => void;
  seeAllHref?: string;
  hideWhenEmpty?: boolean;
  headingLevel?: 1 | 2;
}) {
  const t = useTranslations("externalTravel");
  const locale = useLocale();
  const [rows, setRows] = useState<ExternalStay[] | null>(null);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const { checkIn, checkOut, guests, pets } = context;

  useEffect(() => {
    const controller = new AbortController();
    setRows(null);
    setFailed(false);
    travelExternalService
      .search({ city: city || undefined, checkIn, checkOut, guests, pets, source: JAJIGA_SOURCE, page, pageSize }, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setRows(value.items);
        setTotal(value.total);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [city, checkIn, checkOut, guests, pets, page, pageSize, revision]);

  if (hideWhenEmpty && rows !== null && rows.length === 0) return null;
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const nf = new Intl.NumberFormat(locale);

  return (
    <section aria-labelledby="jajiga-stays-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Heading id="jajiga-stays-title" className={headingLevel === 1 ? "text-page-title text-text-primary" : "text-section-title text-text-primary"}>
            {city ? t("blend.titleCity", { city }) : t("blend.title")}
          </Heading>
          <p className="text-metadata text-text-secondary">{t("blend.hint")}</p>
        </div>
        {seeAllHref && rows && rows.length > 0 ? (
          <Link className="text-sm underline" href={seeAllHref}>
            {t("blend.seeAll")}
          </Link>
        ) : null}
      </div>
      {failed ? (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-text-secondary">{t("loadFailed")}</p>
          <Button size="sm" variant="secondary" onClick={() => setRevision((v) => v + 1)}>{t("retry")}</Button>
        </div>
      ) : rows === null ? (
        <div className="grid gap-3 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-text-secondary">{t("empty")}</p>
      ) : (
        <>
          <ul className="grid gap-3 md:grid-cols-2">
            {rows.map((stay) => (
              <li key={stay.id} className="min-w-0">
                <ExternalStayCard stay={stay} context={context} />
              </li>
            ))}
          </ul>
          {onPage && total > pageSize ? (
            <nav aria-label={t("blend.pages")} className="flex items-center justify-center gap-3">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t("previous")}</Button>
              <span className="text-sm text-text-secondary">{nf.format(page)} / {nf.format(Math.ceil(total / pageSize))}</span>
              <Button size="sm" variant="secondary" disabled={page * pageSize >= total} onClick={() => onPage(page + 1)}>{t("next")}</Button>
            </nav>
          ) : null}
        </>
      )}
    </section>
  );
}
