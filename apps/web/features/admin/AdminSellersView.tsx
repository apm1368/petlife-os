"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import type { AdminSellerOrgSummaryDto, PaginatedDto } from "@petlife/types";
import { adminService } from "@/services/admin.service";
import { adminStatusTone } from "./status-tone";
import { EmptyRow, TableWrap, Td, Th } from "./console-ui";

export function AdminSellersView() {
  const t = useTranslations("admin.orgs");
  const tCommon = useTranslations("admin.common");
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [orgs, setOrgs] = useState<PaginatedDto<AdminSellerOrgSummaryDto> | null>(null);
  const [error, setError] = useState(false);
  const [searched, setSearched] = useState(true);

  useEffect(() => {
    let active = true;
    adminService.listSellers("", { page: 1, pageSize: 30 }).then((result) => { if (active) { setOrgs(result); setSearched(true); } }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);

  async function search(page = 1) {
    setError(false);
    setOrgs(null);
    try {
      setOrgs(await adminService.listSellers(q.trim(), { page, pageSize: 30 }));
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
      {!error && orgs ? <TableWrap><table className="w-full"><thead><tr><Th>{t("columns.name")}</Th><Th>{t("columns.status")}</Th><Th>{t("columns.verification")}</Th><Th>{t("columns.created")}</Th></tr></thead><tbody>{orgs.items.length ? orgs.items.map((org) => <tr key={org.id}><Td><Link className="font-medium text-brand-natural hover:underline" href={`/${locale}/admin/sellers/${org.id}`}>{org.name}</Link></Td><Td><StatusLabel tone={adminStatusTone(org.status)}>{t(`status.${org.status}`)}</StatusLabel></Td><Td><StatusLabel tone={adminStatusTone(org.verificationStatus)}>{t(`status.${org.verificationStatus}`)}</StatusLabel></Td><Td>{new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US").format(new Date(org.createdAt))}</Td></tr>) : <EmptyRow colSpan={4} label={tCommon("empty")} />}</tbody></table></TableWrap> : null}
      {orgs && orgs.total > orgs.pageSize ? <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-3"><span className="text-metadata text-text-secondary">{tCommon("page", { page: orgs.page })}</span><div className="flex gap-2"><Button size="sm" variant="secondary" disabled={orgs.page <= 1} onClick={() => void search(orgs.page - 1)}>{tCommon("previous")}</Button><Button size="sm" variant="secondary" disabled={orgs.page * orgs.pageSize >= orgs.total} onClick={() => void search(orgs.page + 1)}>{tCommon("next")}</Button></div></div> : null}
    </div>
  );
}
