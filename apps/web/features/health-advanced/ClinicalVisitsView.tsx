"use client";

import { useLocale } from "next-intl";
import Link from "next/link";
import type { ClinicalVisitDto } from "@petlife/types";
import { StatusLabel } from "@petlife/ui";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { HealthRecordListView } from "./HealthRecordListView";
import { useStatusText } from "@/lib/status/use-status-text";

export function ClinicalVisitsView({ petId }: { petId: string }) {
  const statusText = useStatusText();
  const locale = useLocale() as "fa" | "en";
  const fa = locale === "fa";
  return <HealthRecordListView<ClinicalVisitDto> petId={petId} title={fa ? "ویزیت‌های بالینی" : "Clinical visits"} emptyTitle={fa ? "هنوز ویزیت بالینی ثبت نشده است." : "No clinical visits recorded."} fetcher={healthAdvancedService.listVisits} keyOf={(visit) => visit.id} renderItem={(visit) => <Link href={"/" + locale + "/pets/" + petId + "/health/advanced/visits/" + visit.id} className="block"><div className="flex items-center justify-between gap-3"><span className="font-bold text-text-primary">{visit.reasonForVisit ?? (fa ? "ویزیت بالینی" : "Clinical visit")}</span><StatusLabel tone={visit.status === "COMPLETED" || visit.status === "AMENDED" ? "success" : "neutral"}>{statusText.label(visit.status, "visit")}</StatusLabel></div><p className="mt-2 text-sm text-text-secondary">{visit.providerOrganizationName}</p></Link>} />;
}
