"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import { apiErrorText } from "@/lib/errors/api-error-text";
import { clinicInvitationsService, type ClinicInvitationDto } from "@/services/clinic-invitations.service";

const ROLE = { fa: { VET: "دامپزشک", STAFF: "کارمند", OWNER: "مدیر" }, en: { VET: "Vet", STAFF: "Staff", OWNER: "Owner" } } as const;

/** Functional only (Codex owns the design): the signed-in member's pending clinic invitations, accept or decline. */
export function ClinicInvitationsView() {
  const locale = useLocale() === "en" ? "en" : "fa";
  const fa = locale === "fa";
  const router = useRouter();
  const [items, setItems] = useState<ClinicInvitationDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setItems(await clinicInvitationsService.mine());
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function respond(id: string, action: "accept" | "decline") {
    setBusy(id);
    setError(null);
    try {
      if (action === "accept") {
        await clinicInvitationsService.accept(id);
        router.push(`/${locale}/provider`);
        return;
      }
      await clinicInvitationsService.decline(id);
      await load();
    } catch (e) {
      setError(apiErrorText(e, undefined, fa ? "انجام نشد. دوباره تلاش کنید." : "That didn't work. Please try again."));
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (failed) return <ErrorRecovery title={fa ? "دعوت‌ها بارگیری نشد" : "Invitations could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Retry"} onRetry={load} />;
  if (!items) return <Skeleton className="h-40 w-full" />;
  return (
    <section className="clinic-invitations" aria-labelledby="clinic-invitations-title">
      <h1 id="clinic-invitations-title">{fa ? "دعوت‌های کلینیک" : "Clinic invitations"}</h1>
      {error ? <p role="alert">{error}</p> : null}
      {items.length === 0 ? (
        <EmptyState title={fa ? "دعوت در انتظاری ندارید" : "No pending invitations"} />
      ) : (
        <ul className="row-list">
          {items.map((i) => (
            <li key={i.id} className="row-list__item row-list__item--stack">
              <strong>{i.organization.name}</strong>
              <span>{ROLE[locale][i.role]}{i.displayTitle ? ` · ${i.displayTitle}` : ""}</span>
              <div className="flex gap-2">
                <Button variant="primary" isLoading={busy === i.id} onClick={() => void respond(i.id, "accept")}>{fa ? "پذیرفتن" : "Accept"}</Button>
                <Button variant="ghost" disabled={busy === i.id} onClick={() => void respond(i.id, "decline")}>{fa ? "رد کردن" : "Decline"}</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
