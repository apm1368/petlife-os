import { useLocale, useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/currency/format-currency";

/** spec: "do not fake real-time raised amount from cached UI values" — always renders exactly what SupportCampaignDto.raisedAmountIrr carries (a ledger-derived read), never a locally computed estimate. */
export function CampaignProgressBar({ raisedAmountIrr, targetAmountIrr }: { raisedAmountIrr: number; targetAmountIrr: number | null }) {
  const t = useTranslations("animalSupport");
  const lang = useLocale() as "fa" | "en";
  const pct = targetAmountIrr ? Math.min(100, Math.round((raisedAmountIrr / targetAmountIrr) * 100)) : null;

  return (
    <div className="flex flex-col gap-1">
      {pct !== null ? (
        <div className="h-2 w-full rounded-full bg-border-subtle" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={lang === "fa" ? "پیشرفت جمع‌آوری کمک" : "Fundraising progress"}>
          <div className="h-2 rounded-full bg-brand-mint" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      <p className="text-metadata text-text-secondary">
        {targetAmountIrr ? t("campaignCard.raisedOfTarget", { raised: formatCurrency(raisedAmountIrr, lang), target: formatCurrency(targetAmountIrr, lang) }) : t("campaignCard.raised", { raised: formatCurrency(raisedAmountIrr, lang) })}
      </p>
    </div>
  );
}
