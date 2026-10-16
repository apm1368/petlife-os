"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, Input, Mail } from "@petlife/ui";
import { SupportCaseCategory } from "@petlife/types";
import { useSessionStore } from "@/stores/session-store";
import { supportService } from "@/services/support.service";
import { buildLoginUrl } from "@/lib/auth/return-to";
import { ApiError } from "@/lib/api/client";
import "./contact-design.css";

const DRAFT = "petlife-contact-draft-v1";

/** Reuses the real support case API. Guest drafts survive sign-in; success needs a server ID. */
export function ContactView() {
  const t = useTranslations("rollout.contact");
  const locale = useLocale() as "fa" | "en";
  const router = useRouter();
  const status = useSessionStore((s) => s.status);
  const user = useSessionStore((s) => s.user);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  useEffect(() => {
    try { const draft = JSON.parse(sessionStorage.getItem(DRAFT) ?? "null"); if (typeof draft?.subject === "string") setSubject(draft.subject.slice(0, 200)); if (typeof draft?.description === "string") setDescription(draft.description.slice(0, 10000)); } catch { /* Storage is optional; the form remains usable. */ } finally { setDraftLoaded(true); }
  }, []);
  function keepDraft() { try { sessionStorage.setItem(DRAFT, JSON.stringify({ subject, description })); } catch { /* A blocked storage does not block authenticated delivery. */ } }
  useEffect(() => { if (draftLoaded && !sent) { try { sessionStorage.setItem(DRAFT, JSON.stringify({ subject, description })); } catch { /* Delivery can still use the authenticated API. */ } } }, [draftLoaded, subject, description, sent]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!subject.trim() || !description.trim() || busy) return;
    keepDraft();
    if (status !== "authenticated") { router.push(buildLoginUrl(locale, `/${locale}/contact`)); return; }
    setBusy(true); setFailed(false);
    try {
      const result = await supportService.create({ subject: subject.trim(), description: description.trim(), category: SupportCaseCategory.OTHER });
      setSent(result.id);
      try { sessionStorage.removeItem(DRAFT); } catch { /* The server result remains authoritative. */ }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) router.push(buildLoginUrl(locale, `/${locale}/contact`));
      else setFailed(true);
    } finally { setBusy(false); }
  }
  return <section className="contact-scene">
    <Image src={locale === "fa" ? "/images/landing/tehran-park.webp" : "/images/landing/tehran-park-en.webp"} alt="" fill priority sizes="100vw" className="contact-scene__image" />
    <div className="contact-scene__shade" aria-hidden="true" />
    <header className="contact-scene__heading"><p>{t("eyebrow")}</p><h1>{t("title")}</h1><p>{t("subtitle")}</p></header>
    <div className="contact-glass">
      {sent ? <div role="status" className="contact-success"><Mail size={38} aria-hidden="true" /><h2>{t("sent")}</h2><Link href={`/${locale}/support/tickets/${sent}`}>{t("openTicket")}</Link></div> : <form onSubmit={submit}>
        {user ? <p className="contact-glass__identity">{user.displayName}</p> : <p>{t("signInHint")}</p>}
        <Input label={t("subject")} value={subject} maxLength={200} required onChange={(e) => setSubject(e.target.value)} />
        <label><span>{t("message")}</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={10000} rows={6} required /></label>
        <p className="contact-glass__hint">{status === "authenticated" ? t("draftHint") : t("savedDraft")}</p>
        {failed ? <p role="alert">{t("failed")}</p> : null}
        <Button type="submit" isLoading={busy} disabled={!subject.trim() || !description.trim() || status === "loading" || status === "idle"}>{status === "authenticated" ? t("send") : t("signIn")}</Button>
      </form>}
    </div>
    {status === "authenticated" ? <Link className="contact-scene__support" href={`/${locale}/support`}>{t("support")}</Link> : null}
  </section>;
}
