"use client";

import { useStatusText } from "@/lib/status/use-status-text";
import { useState } from "react";
import Link from "next/link";
import {useAdminStore} from "@/stores/admin-store";
import { useLocale, useTranslations } from "next-intl";
import { ContextSurface, EmptyState, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import type { AdminSellerOrgSummaryDto } from "@petlife/types";
import { adminService } from "@/services/admin.service";
import { adminStatusTone } from "./status-tone";

export function AdminSellersView() {
  const locale=useLocale(),statusText=useStatusText(),verification=useTranslations("partnerVerification"),context=useAdminStore(s=>s.context),canReview=!!context?.permissions.includes("verification.manage");
  const t = useTranslations("admin.orgs");
  const tCommon = useTranslations("admin.common");
  const [q, setQ] = useState("");
  const [orgs, setOrgs] = useState<AdminSellerOrgSummaryDto[] | null>(null);
  const [error, setError] = useState(false);
  const [searched, setSearched] = useState(false);

  async function search() {
    setError(false);
    try {
      const page = await adminService.listSellers(q, { pageSize: 30 });
      setOrgs(page.items);
      setSearched(true);
    } catch {
      setError(true);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title text-text-primary">{t("sellersTitle")}</h1>
      <Input
        label={t("sellersTitle")}
        placeholder={t("searchPlaceholder")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void search();
        }}
      />
      {error ? <ErrorRecovery title={t("sellersTitle")} message="" retryLabel={tCommon("retry")} onRetry={search} /> : null}
      {!error && searched && !orgs ? <Skeleton className="h-40 w-full" aria-label={tCommon("loading")} /> : null}
      {!error && orgs && orgs.length === 0 ? <EmptyState title={tCommon("empty")} /> : null}
      {orgs?.map((org) => (
        <ContextSurface key={org.id} className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-body font-medium text-text-primary">{org.name}</span>
            <div className="flex items-center gap-2">
              <StatusLabel tone={adminStatusTone(org.status)}>{statusText.label(org.status)}</StatusLabel>
              <StatusLabel tone={adminStatusTone(org.verificationStatus)}>{statusText.label(org.verificationStatus)}</StatusLabel>
            </div>
          </div>
          {canReview&&<Link className="underline" href={`/${locale}/admin/verification/seller/${org.id}`}>{verification("reviewCase")}</Link>}
        </ContextSurface>
      ))}
    </div>
  );
}
