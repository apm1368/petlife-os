"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { clinicClientsService } from "@/services/clinic-clients.service";

/** The recipient of a clinic's text stops further texts from that clinic — one tap, no account needed. */
export function ClinicSmsOptOutView({ token }: { token: string }) {
  const t = useTranslations("clinicClients.optOut");
  const [clinic, setClinic] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "done" | "missing" | "failed">("loading");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    clinicClientsService
      .optOutPreview(token, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setClinic(value.clinicName);
        setState(value.optedOut ? "done" : "ready");
      })
      .catch((e: unknown) => !controller.signal.aborted && setState(e instanceof ApiError && e.status === 404 ? "missing" : "failed"));
    return () => controller.abort();
  }, [token]);
  async function stop() {
    if (busy) return;
    setBusy(true);
    try {
      await clinicClientsService.optOut(token);
      setState("done");
    } catch {
      setState("failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="opl-wrap mx-auto w-full max-w-xl space-y-4 py-10">
      <h1 className="text-page-title">{t("title")}</h1>
      <ContextSurface className="space-y-4">
        {state === "loading" ? <p role="status">{t("loading")}</p> : null}
        {state === "missing" ? <p role="alert">{t("missing")}</p> : null}
        {state === "failed" ? <p role="alert">{t("failed")}</p> : null}
        {state === "ready" && clinic ? (
          <>
            <p>{t("explain", { clinic })}</p>
            <Button isLoading={busy} onClick={() => void stop()}>{t("button", { clinic })}</Button>
          </>
        ) : null}
        {state === "done" && clinic ? <p role="status">{t("done", { clinic })}</p> : null}
      </ContextSurface>
    </div>
  );
}
