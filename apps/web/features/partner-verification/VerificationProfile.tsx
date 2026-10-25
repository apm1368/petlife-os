"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, Input } from "@petlife/ui";
import type { PartnerVerificationProfileDto, PartnerVerificationProfileInput } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { partnerVerificationService } from "@/services/partner-verification.service";

export function VerificationProfileSummary({ profile }: { profile?: PartnerVerificationProfileDto | null }) {
  const t = useTranslations("partnerVerification.profile");
  return <ContextSurface className="space-y-3">
    <h2 className="text-section-title">{t("title")}</h2>
    {profile ? <dl className="grid gap-3 sm:grid-cols-2">
      {(["firstName", "lastName", "mobile", "landline", "websiteUrl", "enamadId"] as const).map(field => <div key={field}>
        <dt className="text-text-secondary">{t(field)}</dt><dd dir="auto" className="break-words">{profile[field] || "—"}</dd>
      </div>)}
    </dl> : <p>{t("empty")}</p>}
  </ContextSurface>;
}

export function VerificationProfileForm({ sellerId, editable, onSaved }: { sellerId?: string; editable: boolean; onSaved?: () => void }) {
  const t = useTranslations("partnerVerification.profile");
  const [profile, setProfile] = useState<PartnerVerificationProfileDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setFailed(false);
    partnerVerificationService.profile(sellerId, controller.signal)
      .then(value => { if (!controller.signal.aborted) setProfile(value); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [sellerId, revision]);
  if (loading) return <p role="status">{t("loading")}</p>;
  if (failed) return <div><p role="alert">{t("failed")}</p><Button onClick={() => setRevision(v => v + 1)}>{t("retry")}</Button></div>;
  if (!editable) return <VerificationProfileSummary profile={profile} />;
  return <ProfileEditor key={`${sellerId || "provider"}-${revision}`} initial={profile} sellerId={sellerId} onSaved={value => { setProfile(value); onSaved?.(); }} />;
}

function ProfileEditor({ initial, sellerId, onSaved }: { initial: PartnerVerificationProfileDto | null; sellerId?: string; onSaved: (profile: PartnerVerificationProfileDto) => void }) {
  const t = useTranslations("partnerVerification.profile");
  const [value, setValue] = useState<PartnerVerificationProfileInput>(() => ({ firstName: initial?.firstName || "", lastName: initial?.lastName || "", landline: initial?.landline || "", websiteUrl: initial?.websiteUrl || "", enamadId: initial?.enamadId || "" }));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<"failed" | "phoneRequired" | "locked" | null>(null);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(null); setSaved(false);
    try { const savedProfile = await partnerVerificationService.saveProfile(value, sellerId); onSaved(savedProfile); setSaved(true); }
    catch (error) {
      const reason = error instanceof ApiError ? error.details?.reason : undefined;
      setError(reason === "VERIFIED_MOBILE_REQUIRED" ? "phoneRequired" : reason === "VERIFICATION_PROFILE_LOCKED" ? "locked" : "failed");
    } finally { setBusy(false); }
  }
  return <ContextSurface><form onSubmit={save} className="space-y-4">
    <h2 className="text-section-title">{t("title")}</h2><p>{t("mobileHelp")}</p>
    <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
      {(["firstName", "lastName", "landline", "websiteUrl", "enamadId"] as const).map(field => <Input key={field} label={t(field)} value={value[field] || ""} type={field === "websiteUrl" ? "url" : "text"} required={field === "firstName" || field === "lastName" || field === "landline"} maxLength={field === "websiteUrl" ? 500 : field === "landline" ? 26 : 100} onChange={event => { setValue(v => ({ ...v, [field]: event.target.value })); setSaved(false); }} />)}
    </fieldset>
    {error ? <p role="alert">{t(error)}</p> : null}{saved ? <p role="status">{t("saved")}</p> : null}
    <Button type="submit" disabled={busy}>{t(busy ? "saving" : "save")}</Button>
  </form></ContextSurface>;
}
