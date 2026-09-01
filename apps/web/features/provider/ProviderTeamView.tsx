"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { ProviderTeamMemberDto } from "@petlife/types";
import { providerOsService } from "@/services/provider-os.service";

/** Read-only team roster (spec section 26) — no invitation/deactivation flow this phase. */
export function ProviderTeamView() {
  const t = useTranslations("provider.team");
  const [members, setMembers] = useState<ProviderTeamMemberDto[] | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      setMembers(await providerOsService.listTeam());
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!members) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>
      {members.length === 0 ? <EmptyState title={t("empty")} /> : null}
      <div className="flex flex-col gap-2">
        {members.map((member) => (
          <ContextSurface key={member.providerUserId} className="flex items-center justify-between gap-2">
            <div>
              <p className="text-body font-medium text-text-primary">{member.displayName}</p>
              {member.displayTitle ? <p className="text-metadata text-text-secondary">{member.displayTitle}</p> : null}
            </div>
            <StatusLabel tone="neutral">{t(`role.${member.role}`)}</StatusLabel>
          </ContextSurface>
        ))}
      </div>
    </div>
  );
}
