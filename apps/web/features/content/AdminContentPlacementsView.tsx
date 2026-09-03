"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, ErrorRecovery, Input, Skeleton } from "@petlife/ui";
import type { AdminContentPlacementDto, ContentPlacementKey, Locale as ContentLocale } from "@petlife/types";
import { adminContentService } from "@/services/admin-content.service";

const PLACEMENT_KEYS: ContentPlacementKey[] = ["LANDING_HERO" as ContentPlacementKey, "LANDING_FEATURED_CONTENT" as ContentPlacementKey, "HOME_EDUCATION" as ContentPlacementKey, "HOME_ANNOUNCEMENT" as ContentPlacementKey];
const LOCALES: ContentLocale[] = ["fa", "en"];

interface EditableBlock {
  sortOrder: number;
  linkedArticleId: string;
  mediaAssetId: string;
  faHeading: string;
  faBody: string;
  faCtaLabel: string;
  faCtaHref: string;
  enHeading: string;
  enBody: string;
  enCtaLabel: string;
  enCtaHref: string;
}

function toEditable(dto: AdminContentPlacementDto): EditableBlock[] {
  return dto.blocks.map((b) => {
    const fa = b.locales.find((l) => l.locale === "fa");
    const en = b.locales.find((l) => l.locale === "en");
    return {
      sortOrder: b.sortOrder,
      linkedArticleId: b.linkedArticleId ?? "",
      mediaAssetId: b.mediaAsset?.id ?? "",
      faHeading: fa?.heading ?? "",
      faBody: fa?.body ?? "",
      faCtaLabel: fa?.ctaLabel ?? "",
      faCtaHref: fa?.ctaHref ?? "",
      enHeading: en?.heading ?? "",
      enBody: en?.body ?? "",
      enCtaLabel: en?.ctaLabel ?? "",
      enCtaHref: en?.ctaHref ?? "",
    };
  });
}

/** Typed Landing/Home content hooks (spec: "avoid arbitrary CSS/layout control from CMS — CMS controls content, not visual architecture"). Codex's Landing visual implementation is untouched by this screen; nothing consumes these blocks until a future change deliberately reads them. */
export function AdminContentPlacementsView() {
  const t = useTranslations("admin.content.placements");
  const [key, setKey] = useState<ContentPlacementKey>(PLACEMENT_KEYS[0]!);
  const [blocks, setBlocks] = useState<EditableBlock[]>([]);
  const [error, setError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function load(k: ContentPlacementKey) {
    setError(false);
    try {
      const dto = await adminContentService.getPlacement(k);
      setBlocks(toEditable(dto));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load(key);
  }, [key]);

  function update(index: number, patch: Partial<EditableBlock>) {
    setBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  function addBlock() {
    setBlocks((prev) => [...prev, { sortOrder: prev.length, linkedArticleId: "", mediaAssetId: "", faHeading: "", faBody: "", faCtaLabel: "", faCtaHref: "", enHeading: "", enBody: "", enCtaLabel: "", enCtaHref: "" }]);
  }

  function removeBlock(index: number) {
    setBlocks((prev) => prev.filter((_, i) => i !== index).map((b, i) => ({ ...b, sortOrder: i })));
  }

  async function save() {
    setSaveError(null);
    try {
      await adminContentService.replacePlacementBlocks(
        key,
        blocks.map((b, i) => ({
          sortOrder: i,
          linkedArticleId: b.linkedArticleId || undefined,
          mediaAssetId: b.mediaAssetId || undefined,
          locales: LOCALES.map((locale) => ({
            locale,
            heading: (locale === "fa" ? b.faHeading : b.enHeading) || undefined,
            body: (locale === "fa" ? b.faBody : b.enBody) || undefined,
            ctaLabel: (locale === "fa" ? b.faCtaLabel : b.enCtaLabel) || undefined,
            ctaHref: (locale === "fa" ? b.faCtaHref : b.enCtaHref) || undefined,
          })),
        })),
      );
      await load(key);
    } catch {
      setSaveError(t("saveFailed"));
    }
  }

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={() => load(key)} />;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>

      <div className="flex flex-wrap gap-2">
        {PLACEMENT_KEYS.map((k) => (
          <Button key={k} size="sm" variant={key === k ? "primary" : "secondary"} onClick={() => setKey(k)}>
            {t(`key.${k}`)}
          </Button>
        ))}
      </div>

      {blocks.length === 0 ? <Skeleton className="h-32 w-full" aria-label={t("loading")} /> : null}

      {blocks.map((b, i) => (
        <ContextSurface key={i} className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-metadata text-text-secondary">{t("block", { number: i + 1 })}</span>
            <Button size="sm" variant="ghost" onClick={() => removeBlock(i)}>
              {t("remove")}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input label={t("linkedArticleId")} value={b.linkedArticleId} onChange={(e) => update(i, { linkedArticleId: e.target.value })} />
            <Input label={t("mediaAssetId")} value={b.mediaAssetId} onChange={(e) => update(i, { mediaAssetId: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <span className="text-metadata text-text-secondary">فارسی</span>
              <Input label={t("heading")} value={b.faHeading} onChange={(e) => update(i, { faHeading: e.target.value })} />
              <Input label={t("body")} value={b.faBody} onChange={(e) => update(i, { faBody: e.target.value })} />
              <Input label={t("ctaLabel")} value={b.faCtaLabel} onChange={(e) => update(i, { faCtaLabel: e.target.value })} />
              <Input label={t("ctaHref")} value={b.faCtaHref} onChange={(e) => update(i, { faCtaHref: e.target.value })} />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-metadata text-text-secondary">English</span>
              <Input label={t("heading")} value={b.enHeading} onChange={(e) => update(i, { enHeading: e.target.value })} />
              <Input label={t("body")} value={b.enBody} onChange={(e) => update(i, { enBody: e.target.value })} />
              <Input label={t("ctaLabel")} value={b.enCtaLabel} onChange={(e) => update(i, { enCtaLabel: e.target.value })} />
              <Input label={t("ctaHref")} value={b.enCtaHref} onChange={(e) => update(i, { enCtaHref: e.target.value })} />
            </div>
          </div>
        </ContextSurface>
      ))}

      <div className="flex gap-2">
        <Button variant="secondary" onClick={addBlock}>
          {t("addBlock")}
        </Button>
        <Button onClick={save}>{t("save")}</Button>
      </div>
      {saveError ? <span className="text-metadata text-state-urgent">{saveError}</span> : null}
    </div>
  );
}
