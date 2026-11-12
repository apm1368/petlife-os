"use client";

import { useTranslations } from "next-intl";

/**
 * Marks demo/showcase rows in the back office. Production hides them from the public site
 * (excludeDemoRecordsFromPublicReads), so staff should not read an admin "verified/public" status as live.
 */
export function DemoRecordTag({ isDemoRecord }: { isDemoRecord?: boolean }) {
  const t = useTranslations("admin.demoRecord");
  if (!isDemoRecord) return null;
  return (
    <span title={t("hint")} className="ms-1 inline-flex shrink-0 items-center rounded-full border border-state-attention px-2 py-0.5 text-metadata text-state-attention">
      {t("label")}
    </span>
  );
}
