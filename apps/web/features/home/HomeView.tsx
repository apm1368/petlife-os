"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, EmptyState, ErrorRecovery, PriorityAction, Skeleton, ActivePetSwitcher } from "@petlife/ui";
import type { HomeResponseDto } from "@petlife/types";
import { homeService } from "@/services/home.service";
import { useActivePet } from "@/hooks/use-active-pet";

export function HomeView() {
  const t = useTranslations("home");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const locale = useLocale();
  const { pets, activePetId, switchActivePet, isSwitching } = useActivePet();

  const [home, setHome] = useState<HomeResponseDto | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      const data = await homeService.get();
      setHome(data);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    // Home is context-driven by the active pet — refetch whenever it
    // changes. The optimistic switcher flips `activePetId` locally before
    // the server-side PUT .../active-pet commits, so a refetch triggered by
    // that same instant can race the PUT and read back the *old* active pet
    // — refetching again once `isSwitching` drops back to false (the PUT
    // has resolved) corrects that without giving up the instant-feeling UI.
    void load();
  }, [activePetId, isSwitching]);

  if (error) {
    return <ErrorRecovery title={tCommon("loading")} message="" retryLabel={tCommon("retry")} onRetry={load} />;
  }

  if (!home) {
    return <Skeleton className="h-40 w-full" aria-label={tCommon("loading")} />;
  }

  if (!home.activePet) {
    return (
      <EmptyState
        title={t("action.addPet")}
        actionLabel={t("action.addPet")}
        onAction={() => router.push(`/${locale}/onboarding`)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {pets.length > 1 ? (
        <ActivePetSwitcher pets={pets} activePetId={activePetId} onSelect={(id) => void switchActivePet(id)} />
      ) : null}

      <h1 className="text-hero text-text-primary">{t("title", { name: home.activePet.name })}</h1>

      <ContextSurface>
        <PriorityAction
          title={t(home.primaryAction.labelKey.replace("home.", ""))}
          primaryLabel={tCommon("continue")}
          onPrimary={() => router.push(`/${locale}${home.primaryAction.href}`)}
          secondaryLabel={home.secondaryActions[0] ? t(home.secondaryActions[0].labelKey.replace("home.", ""), { name: home.activePet.name }) : undefined}
          onSecondary={
            home.secondaryActions[0] ? () => router.push(`/${locale}${home.secondaryActions[0]!.href}`) : undefined
          }
        />
      </ContextSurface>

      <ContextSurface>
        <h2 className="text-section-title text-text-primary">{t("sections.ai")}</h2>
        <p className="mt-1 text-body text-text-secondary">{t("aiPlaceholder")}</p>
      </ContextSurface>

      <ContextSurface>
        <h2 className="text-section-title text-text-primary">{t("sections.upcoming")}</h2>
        <p className="mt-1 text-body text-text-secondary">{t("upcomingPlaceholder")}</p>
      </ContextSurface>

      <ContextSurface className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-section-title text-text-primary">{t("sections.exploreServices")}</h2>
          <p className="mt-1 text-body text-text-secondary">{t("exploreServicesHint")}</p>
        </div>
        <Button variant="secondary" onClick={() => router.push(`/${locale}/services`)}>
          {t("exploreServicesAction")}
        </Button>
      </ContextSurface>

      <ContextSurface className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-section-title text-text-primary">{t("sections.shop")}</h2>
          <p className="mt-1 text-body text-text-secondary">{t("shopHint")}</p>
        </div>
        <Button variant="secondary" onClick={() => router.push(`/${locale}/shop`)}>
          {t("shopAction")}
        </Button>
      </ContextSurface>
    </div>
  );
}
