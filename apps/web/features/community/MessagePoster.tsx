"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, MessagesSquare } from "@petlife/ui";
import type { CommunityPostDto } from "@petlife/types";
import { useSessionStore } from "@/stores/session-store";
import { chatService } from "@/services/chat.service";
import { apiErrorText } from "@/lib/errors/api-error-text";

const HOMES = ["apartment", "houseWithYard", "other"] as const;

/**
 * #290 Q52/Q57: reach a post's author in private chat (numbers stay hidden). On adoption posts the first message is a
 * short screening note (home, experience, other pets, why, a visit in person) so the poster can choose carefully.
 */
export function MessagePoster({ post }: { post: Pick<CommunityPostDto, "id" | "type" | "isMine"> }) {
  const t = useTranslations("community.contact");
  const locale = useLocale();
  const router = useRouter();
  const status = useSessionStore((s) => s.status);
  const [screening, setScreening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [home, setHome] = useState<(typeof HOMES)[number]>("apartment");
  const [experience, setExperience] = useState("");
  const [otherPets, setOtherPets] = useState("");
  const [why, setWhy] = useState("");
  const [visit, setVisit] = useState(true);
  if (post.isMine) return null;
  const adoption = post.type === "ADOPTION";

  const start = async (firstMessage?: string) => {
    setBusy(true); setError(null);
    try {
      const conversation = await chatService.openForPost(post.id);
      if (firstMessage) await chatService.send(conversation.id, firstMessage);
      router.push(`/${locale}/community/messages/${conversation.id}`);
    } catch (err) {
      setError(apiErrorText(err, locale));
      setBusy(false);
    }
  };

  if (status !== "authenticated") {
    return (
      <Button variant="secondary" onClick={() => router.push(`/${locale}/welcome?returnTo=${encodeURIComponent(window.location.pathname)}`)}>
        {t("signIn")}
      </Button>
    );
  }

  if (adoption && screening) {
    const note = [
      t("screening.intro"),
      `${t("screening.home")}: ${t(`screening.homes.${home}`)}`,
      experience.trim() ? `${t("screening.experience")}: ${experience.trim()}` : null,
      otherPets.trim() ? `${t("screening.otherPets")}: ${otherPets.trim()}` : null,
      why.trim() ? `${t("screening.why")}: ${why.trim()}` : null,
      visit ? t("screening.visitYes") : null,
    ].filter(Boolean).join("\n");
    return (
      <form className="contact-screening" onSubmit={(e) => { e.preventDefault(); void start(note.slice(0, 2000)); }}>
        <h2>{t("screening.title")}</h2>
        <p>{t("screening.hint")}</p>
        <label><span>{t("screening.home")}</span>
          <select value={home} onChange={(e) => setHome(e.target.value as (typeof HOMES)[number])}>
            {HOMES.map((h) => <option key={h} value={h}>{t(`screening.homes.${h}`)}</option>)}
          </select>
        </label>
        <label><span>{t("screening.experience")}</span><textarea dir="auto" maxLength={400} value={experience} onChange={(e) => setExperience(e.target.value)} /></label>
        <label><span>{t("screening.otherPets")}</span><input dir="auto" maxLength={200} value={otherPets} onChange={(e) => setOtherPets(e.target.value)} /></label>
        <label><span>{t("screening.why")}</span><textarea dir="auto" maxLength={600} required value={why} onChange={(e) => setWhy(e.target.value)} /></label>
        <label className="contact-screening__check"><input type="checkbox" checked={visit} onChange={(e) => setVisit(e.target.checked)} /><span>{t("screening.visit")}</span></label>
        <div className="contact-screening__actions">
          <Button type="submit" variant="primary" isLoading={busy} disabled={!why.trim()}>{t("screening.send")}</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setScreening(false)}>{t("screening.cancel")}</Button>
        </div>
        {error ? <p role="alert" className="text-metadata text-state-urgent">{error}</p> : null}
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Button variant="primary" isLoading={busy} onClick={() => (adoption ? setScreening(true) : void start())}>
        <MessagesSquare size={16} aria-hidden="true" />{adoption ? t("adopt") : t("message")}
      </Button>
      <span className="text-metadata text-text-secondary">{t("private")}</span>
      {error ? <p role="alert" className="text-metadata text-state-urgent">{error}</p> : null}
    </div>
  );
}
