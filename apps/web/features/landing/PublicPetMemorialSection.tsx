"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import { memoriesService, type PublicPetMemorialDto } from "@/services/memories.service";

export function PublicPetMemorialSection() {
  const t = useTranslations("landing.publicMemorial");
  const tc = useTranslations("common");
  const [items, setItems] = useState<PublicPetMemorialDto[] | null>(null);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    setFailed(false);
    try {
      const rows = await memoriesService.listPublicMemorials();
      setItems(rows);
      setIndex((current) => rows.length === 0 ? 0 : Math.min(current, rows.length - 1));
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <section className="park-memorial" aria-labelledby="park-memorial-title">
    <div className="park-section-heading"><p className="park-eyebrow">{t("eyebrow")}</p><h2 id="park-memorial-title">{t("title")}</h2><p>{t("description")}</p></div>
    {failed ? <ErrorRecovery title={t("title")} message={t("loadError")} retryLabel={tc("retry")} onRetry={() => void load()} /> : null}
    {!failed && items === null ? <Skeleton className="h-64 w-full" aria-label={tc("loading")} /> : null}
    {!failed && items?.length === 0 ? <EmptyState title={t("empty")} /> : null}
    {!failed && items && items.length > 0 ? <div className="park-memorial__carousel" role="region" aria-roledescription={t("carousel")} aria-label={t("title")}>
      <Button variant="secondary" size="sm" aria-label={t("previous")} disabled={items.length < 2} onClick={() => setIndex((current) => (current - 1 + items.length) % items.length)}>{t("previous")}</Button>
      <article className="park-memorial__slide" aria-live="polite" aria-atomic="true">
        <Image unoptimized src={items[index]!.imageUrl} alt={t("imageAlt", { name: items[index]!.name })} width={600} height={600} loading="lazy" />
        <h3>{items[index]!.name}</h3>
      </article>
      <Button variant="secondary" size="sm" aria-label={t("next")} disabled={items.length < 2} onClick={() => setIndex((current) => (current + 1) % items.length)}>{t("next")}</Button>
    </div> : null}
  </section>;
}
