"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, ErrorRecovery, Skeleton } from "@petlife/ui";
import type { PetAccessFlags, PetDto } from "@petlife/types";
import { petsService } from "@/services/pets.service";
import {
  PET_CARD_HEALTH_FIELDS,
  PET_CARD_IDENTITY_FIELDS,
  petSafetyService,
  type CreatedPetShareCardDto,
  type PetCardField,
  type PetShareCardDto,
} from "@/services/pet-safety.service";
import { useInstantFormat } from "@/lib/date/use-instant-format";
import { QrCodeSvg, qrSvgMarkup } from "./QrCodeSvg";
import "./pet-card.css";

/**
 * The member side of the public pet card (QA M9): pick what a finder may see, see it before publishing, create the
 * collar-tag card with its QR code, and revoke it. Only the existing API is used (POST /pets/:id/share-cards …).
 * The raw link exists only in the create response, so the QR is shown once and can be downloaded or printed then.
 */
export function PetCardManagerView({ petId }: { petId: string }) {
  const t = useTranslations("petCard");
  const locale = useLocale();
  const format = useInstantFormat();
  const [data, setData] = useState<{ pet: PetDto; access: PetAccessFlags; cards: PetShareCardDto[] } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [fields, setFields] = useState<Set<PetCardField>>(() => new Set(PET_CARD_IDENTITY_FIELDS));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedPetShareCardDto | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [pet, access] = await Promise.all([petsService.getById(petId), petsService.getMyAccess(petId)]);
      const cards = access.canManageAccess ? await petSafetyService.listCards(petId) : [];
      setData({ pet, access, cards });
    } catch {
      setLoadError(true);
    }
  }, [petId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadError) return <ErrorRecovery title={t("loadError")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!data) return <Skeleton className="h-96 w-full" aria-label={t("loading")} />;

  const { pet, access, cards } = data;
  const name = pet.name;
  const back = `/${locale}/pets/${petId}`;
  const active = cards.find((card) => card.state === "ACTIVE" && card.kind === "ID_TAG");
  const offered: PetCardField[] = [...PET_CARD_IDENTITY_FIELDS, ...(access.canViewHealth ? PET_CARD_HEALTH_FIELDS : [])];
  const chosen = offered.filter((field) => fields.has(field));

  const toggle = (field: PetCardField) =>
    setFields((current) => {
      const next = new Set(current);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });

  async function create() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const card = await petSafetyService.createIdTagCard(petId, chosen);
      setCreated(card);
      setCopied(false);
      setData((current) => (current ? { ...current, cards: [card, ...current.cards.map((c) => (c.state === "ACTIVE" && c.kind === card.kind ? { ...c, state: "REVOKED" as const } : c))] } : current));
    } catch {
      setError(t("createError"));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(cardId: string) {
    setBusy(true);
    setError(null);
    try {
      await petSafetyService.revokeCard(petId, cardId);
      if (created?.id === cardId) setCreated(null);
      setConfirming(null);
      setNotice(t("revoked"));
      await load();
    } catch {
      setError(t("revokeError"));
    } finally {
      setBusy(false);
    }
  }

  const link = created ? new URL(created.publicPath, window.location.origin).toString() : null;

  function download() {
    if (!link) return;
    const url = URL.createObjectURL(new Blob([qrSvgMarkup(link)], { type: "image/svg+xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `opetlife-${name.replace(/[^\p{L}\p{N}]+/gu, "-")}-qr.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="pet-card-manager flex flex-col gap-5">
      <div>
        <Link href={back} className="text-metadata text-text-secondary underline">{t("back", { name })}</Link>
        <h1 className="mt-2 text-page-title text-text-primary">{t("title")}</h1>
        <p className="mt-1 text-body text-text-secondary">{t("intro", { name })}</p>
      </div>

      {!access.canManageAccess ? (
        <p role="note" className="text-body text-text-secondary">{t("noAccess")}</p>
      ) : (
        <>
          {created && link ? (
            <ContextSurface className="pet-card-print flex flex-col items-center gap-4 text-center">
              <h2 className="text-body font-medium text-text-primary">{t("readyTitle")}</h2>
              <QrCodeSvg text={link} label={t("qrLabel", { name })} />
              <p className="pet-card-print__name text-body font-medium text-text-primary">{name}</p>
              <p className="pet-card-link break-all text-metadata text-text-secondary" dir="ltr">{link}</p>
              <p role="note" className="pet-card-once text-metadata text-text-secondary">{t("onceNote")}</p>
              <div className="pet-card-actions flex flex-wrap justify-center gap-2">
                <button type="button" className="opl-btn primary sm" onClick={download}>{t("download")}</button>
                <button type="button" className="opl-btn soft sm" onClick={() => window.print()}>{t("print")}</button>
                <button
                  type="button"
                  className="opl-btn line sm"
                  onClick={() => void navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => undefined)}
                >
                  {copied ? t("copied") : t("copy")}
                </button>
                <a className="opl-btn line sm" href={link} target="_blank" rel="noreferrer">{t("open")}</a>
              </div>
            </ContextSurface>
          ) : null}

          <ContextSurface className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-body font-medium text-text-primary">{t("fieldsTitle")}</legend>
              {PET_CARD_IDENTITY_FIELDS.map((field) => (
                <label key={field} className="pet-card-option">
                  <input type="checkbox" checked={fields.has(field)} onChange={() => toggle(field)} />
                  <span>{t(`fields.${field}`)}</span>
                </label>
              ))}
              {access.canViewHealth ? (
                <>
                  <p className="mt-2 text-metadata font-medium text-text-primary">{t("healthGroup")}</p>
                  {PET_CARD_HEALTH_FIELDS.map((field) => (
                    <label key={field} className="pet-card-option">
                      <input type="checkbox" checked={fields.has(field)} onChange={() => toggle(field)} />
                      <span>{t(`fields.${field}`)}</span>
                    </label>
                  ))}
                </>
              ) : null}
            </fieldset>

            <section aria-labelledby="pet-card-preview" className="pet-card-preview">
              <h2 id="pet-card-preview" className="text-metadata font-medium text-text-primary">{t("previewTitle")}</h2>
              <ul>
                <li>{t("previewName", { name })}</li>
                {chosen.map((field) => (
                  <li key={field}>{t(`fields.${field}`)}</li>
                ))}
                <li>{t("previewMessage")}</li>
              </ul>
              <p className="text-metadata text-text-secondary">
                <strong>{t("neverTitle")}:</strong> {t("never")}
              </p>
            </section>

            {active ? <p role="note" className="text-metadata text-text-secondary">{t("replaceNote")}</p> : null}
            {error ? <p role="alert" className="text-metadata text-state-urgent">{error}</p> : null}
            <Button className="w-fit" isLoading={busy} onClick={create}>
              {busy ? t("creating") : active ? t("replace") : t("create")}
            </Button>
          </ContextSurface>

          <ContextSurface className="flex flex-col gap-3">
            <h2 className="text-body font-medium text-text-primary">{t("listTitle", { name })}</h2>
            {notice ? <p role="status" className="text-metadata text-state-success">{notice}</p> : null}
            {cards.length === 0 ? (
              <p className="text-metadata text-text-secondary">{t("listEmpty")}</p>
            ) : (
              <ul className="pet-card-list">
                {cards.map((card) => (
                  <li key={card.id}>
                    <div className="flex flex-col gap-0.5">
                      <strong className="text-metadata text-text-primary">
                        {t(`kind.${card.kind}`)} · <span data-state={card.state}>{t(`state.${card.state}`)}</span>
                      </strong>
                      <span className="text-metadata text-text-secondary">
                        {t("created", { date: format.date(card.createdAt) })} · {t("ending", { hint: card.tokenHint })}
                      </span>
                      <span className="text-metadata text-text-secondary">
                        {t("views", { count: format.number(card.accessCount) })}
                        {card.lastAccessedAt ? ` · ${t("lastViewed", { date: format.dateTime(card.lastAccessedAt) })}` : ""}
                      </span>
                    </div>
                    {card.state === "ACTIVE" ? (
                      confirming === card.id ? (
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className="opl-btn primary sm" disabled={busy} onClick={() => void revoke(card.id)}>{t("revokeConfirm")}</button>
                          <button type="button" className="opl-btn line sm" onClick={() => setConfirming(null)}>{t("revokeCancel")}</button>
                        </div>
                      ) : (
                        <button type="button" className="opl-btn line sm" onClick={() => setConfirming(card.id)}>{t("revoke")}</button>
                      )
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </ContextSurface>
        </>
      )}
    </div>
  );
}
