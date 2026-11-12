"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Bell, Button, PawPrint } from "@petlife/ui";
import { CommunityPostType, type CommunityPostDto } from "@petlife/types";
import type { RouteLocale } from "@/lib/i18n/config";
import { useSessionStore } from "@/stores/session-store";
import { lostPetService, type LostPetAreaAlert } from "@/services/lost-pet.service";
import { communityService } from "@/services/community.service";

const RADII = [1, 3, 5, 10] as const;

/**
 * #290 Q53: an opt-in neighbourhood alert. The browser shares the member's position once; the server keeps it private
 * and only answers "on, N km". Signed-out visitors get a sign-in link instead.
 */
export function LostPetAreaAlertCard() {
  const t = useTranslations("lostPet.areaAlert");
  const lang = useLocale() as RouteLocale;
  const session = useSessionStore((s) => s.status);
  const [alert, setAlert] = useState<LostPetAreaAlert | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(3);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<"denied" | "failed" | null>(null);

  useEffect(() => {
    if (session !== "authenticated") return;
    lostPetService.getAreaAlert().then((a) => { setAlert(a); if (a.radiusKm) setRadiusKm(a.radiusKm); }).catch(() => setAlert({ active: false, radiusKm: null }));
  }, [session]);

  const turnOn = useCallback(() => {
    setProblem(null);
    if (!("geolocation" in navigator)) { setProblem("denied"); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try { setAlert(await lostPetService.setAreaAlert({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, radiusKm })); }
        catch { setProblem("failed"); }
        finally { setBusy(false); }
      },
      () => { setProblem("denied"); setBusy(false); },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    );
  }, [radiusKm]);

  const turnOff = async () => {
    setBusy(true); setProblem(null);
    try { setAlert(await lostPetService.removeAreaAlert()); } catch { setProblem("failed"); } finally { setBusy(false); }
  };

  return (
    <section className="lost-neighbour-card" aria-labelledby="lost-alert-title">
      <span className="lost-neighbour-card__icon" aria-hidden="true"><Bell size={20} /></span>
      <div className="lost-neighbour-card__body">
        <h2 id="lost-alert-title">{t("title")}</h2>
        <p>{alert?.active ? t("on", { km: alert.radiusKm ?? radiusKm }) : t("body")}</p>
        {session !== "authenticated" ? (
          <Link className="btn-primary-link" href={`/${lang}/welcome?returnTo=${encodeURIComponent(`/${lang}/lost-pets`)}`}>{t("signIn")}</Link>
        ) : (
          <div className="lost-neighbour-card__actions">
            <label>
              <span>{t("radius")}</span>
              <select value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} disabled={busy}>
                {RADII.map((km) => <option key={km} value={km}>{t("km", { km })}</option>)}
              </select>
            </label>
            <Button variant="primary" size="sm" isLoading={busy} onClick={turnOn}>{alert?.active ? t("update") : t("enable")}</Button>
            {alert?.active ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => void turnOff()}>{t("disable")}</Button> : null}
          </div>
        )}
        <p className="lost-neighbour-card__note">{t("privacy")}</p>
        {problem ? <p role="alert" className="text-metadata text-state-urgent">{t(problem)}</p> : null}
      </div>
    </section>
  );
}

/** #290 Q54: pets that neighbours found and posted, so a family can recognise theirs; plus the way to post one. */
export function FoundByNeighbours() {
  const t = useTranslations("lostPet.found");
  const lang = useLocale() as RouteLocale;
  const [posts, setPosts] = useState<CommunityPostDto[] | null>(null);
  useEffect(() => {
    communityService.listPosts({ type: CommunityPostType.FOUND_PET, pageSize: 6 }).then((r) => setPosts(r.items)).catch(() => setPosts([]));
  }, []);
  return (
    <section className="lost-neighbour-found" aria-labelledby="lost-found-title">
      <div className="lost-neighbour-found__head">
        <div>
          <h2 id="lost-found-title">{t("title")}</h2>
          <p>{t("subtitle")}</p>
        </div>
        <Link className="btn-primary-link" href={`/${lang}/community/new?type=FOUND_PET`}><PawPrint size={16} aria-hidden="true" />{t("cta")}</Link>
      </div>
      {posts && posts.length > 0 ? (
        <ul>
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={`/${lang}/community/posts/${p.id}`}>
                <strong>{p.title || t("untitled")}</strong>
                <span>{p.body.slice(0, 140)}{p.body.length > 140 ? "…" : ""}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : posts ? <p className="lost-neighbour-found__empty">{t("empty")}</p> : null}
    </section>
  );
}
