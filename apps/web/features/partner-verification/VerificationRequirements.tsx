"use client";
import { useLocale, useTranslations } from "next-intl";
import { ContextSurface } from "@petlife/ui";
import type { VerificationState } from "@/services/partner-verification.service";

/** Both portals render the server's policy; business rules are never duplicated in the browser. */
export function VerificationRequirements({ policy }: Pick<VerificationState, "policy">) {
  const t = useTranslations("partnerVerification"), locale = useLocale();
  if (!policy) return <p role="status">{t("policyUnavailable")}</p>;
  const accepted = policy.requiredDocumentKinds.length - policy.missingForApproval.length;
  const n = (value: number) => new Intl.NumberFormat(locale).format(value);
  return <ContextSurface className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-section-title">{t("requirementsTitle")}</h2><p className="text-text-secondary">{t("requirementsIntro")}</p></div>
      <span className="rounded-full border border-current px-3 py-1 text-sm">{t("requirementProgress", { accepted: n(accepted), total: n(policy.requiredDocumentKinds.length) })}</span>
    </div>
    <ul className="grid gap-3 sm:grid-cols-2">
      {policy.requiredDocumentKinds.map(kind => {
        const ready = !policy.missingForApproval.includes(kind), uploaded = !policy.missingForSubmission.includes(kind);
        return <li key={kind} className="flex items-center justify-between gap-3 rounded-xl border border-current/20 p-4">
          <span>{t(kind === "BUSINESS_LICENSE" && policy.requiresBusinessEvidence ? "businessEvidenceRequirement" : `documentKinds.${kind}`)}</span><span className="text-sm">{t(ready ? "requirementAccepted" : uploaded ? "requirementPending" : "requirementMissing")}</span>
        </li>;
      })}
    </ul>
    {policy.requiredProfileFields?.length ? <ul className="grid gap-3 sm:grid-cols-2">
      {policy.requiredProfileFields.map(field => <li key={field} className="flex items-center justify-between gap-3 rounded-xl border border-current/20 p-4">
        <span>{t(`profile.${field}`)}</span><span className="text-sm">{t(policy.missingProfileFields?.includes(field) ? "profileRequired" : "profileRecorded")}</span>
      </li>)}
    </ul> : null}
    <p className="text-sm text-text-secondary">{t("manualPolicyNotice")}</p>
  </ContextSurface>;
}
