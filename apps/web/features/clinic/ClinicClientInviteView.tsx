"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface } from "@petlife/ui";
import Link from "@/features/navigation/localized-link";
import { ApiError } from "@/lib/api/client";
import { clinicClientsService } from "@/services/clinic-clients.service";

/** The owner's side of a clinic's invitation: who invited them and which pets, then an explicit choice to connect. */
export function ClinicClientInviteView({ token }: { token: string }) {
  const t = useTranslations("clinicClients.join");
  const [preview, setPreview] = useState<{ clinicName: string; pets: string[]; joined: boolean } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "failed" | "connected" | "used">("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    clinicClientsService
      .previewInvite(token, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setPreview(value);
        setState("ready");
      })
      .catch((e: unknown) => !controller.signal.aborted && setState(e instanceof ApiError && e.status === 404 ? "missing" : "failed"));
    return () => controller.abort();
  }, [token]);

  async function accept() {
    if (busy) return;
    setBusy(true);
    try {
      await clinicClientsService.acceptInvite(token);
      setState("connected");
    } catch (e) {
      setState(e instanceof ApiError && e.status === 409 ? "used" : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      <h1 className="text-page-title">{t("title")}</h1>
      <ContextSurface className="space-y-4">
        {state === "loading" ? <p role="status">{t("loading")}</p> : null}
        {state === "missing" ? <p role="alert">{t("missing")}</p> : null}
        {state === "failed" ? <p role="alert">{t("failed")}</p> : null}
        {state === "used" ? <p role="alert">{t("used")}</p> : null}
        {preview && (state === "ready" || state === "connected") ? (
          <>
            <p className="text-section-title">{t("invitedBy", { clinic: preview.clinicName })}</p>
            {preview.pets.length ? <p>{t("pets", { pets: preview.pets.join("، ") })}</p> : null}
            <p className="text-text-secondary">{t("explain")}</p>
            {state === "connected" ? (
              <>
                <p role="status">{t("connected", { clinic: preview.clinicName })}</p>
                <Link className="underline" href="/pets">{t("addPets")}</Link>
              </>
            ) : (
              <Button isLoading={busy} onClick={() => void accept()}>{t("accept")}</Button>
            )}
          </>
        ) : null}
      </ContextSurface>
    </div>
  );
}
