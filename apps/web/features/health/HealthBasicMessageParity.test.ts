import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import fa from "@/messages/fa.json";
import de from "@/messages/de.json";
import es from "@/messages/es.json";

const catalogs = { fa, en, de, es } as const;
const paths = [
  "health.overview.title", "health.overview.subtitle", "health.overview.attention", "health.overview.complete", "health.overview.current", "health.overview.records", "health.overview.care", "health.overview.allergies", "health.overview.conditions", "health.overview.medications", "health.overview.vaccination", "health.overview.active", "health.overview.noActiveMedications", "health.overview.upcoming", "health.overview.overdue", "health.overview.openPlan", "health.overview.recentVisits", "health.overview.recentDocuments", "health.overview.noVisit", "health.overview.noDocument", "health.overview.timeline", "health.overview.documents", "health.overview.labs", "health.overview.imaging", "health.overview.referrals", "health.overview.dental", "health.overview.nutrition", "health.overview.rehab", "health.overview.observations", "health.overview.visits", "health.overview.open", "health.overview.shareVet", "health.overview.activity", "health.overview.sharesLink", "health.overview.moreItems",
  "health.attention.vaccinationDueSoon", "health.attention.vaccinationOverdue", "health.knowledgeState.KNOWN_PRESENT", "health.knowledgeState.KNOWN_NEGATIVE", "health.knowledgeState.UNKNOWN", "health.knowledgeState.INCOMPLETE", "health.vaccinationStatus.UP_TO_DATE", "health.vaccinationStatus.DUE_SOON", "health.vaccinationStatus.OVERDUE", "health.vaccinationStatus.UNKNOWN", "health.vaccinationStatus.INCOMPLETE", "health.setupStatus.COMPLETE", "common.loading", "common.save", "common.cancel", "errors.offline",
  "health.allergies.title", "health.allergies.empty", "health.allergies.loadFailed", "health.allergies.saveFailed", "health.allergies.retry", "health.allergies.addAllergy", "health.allergies.name", "health.allergies.reactionOptional", "health.allergies.severityOptional", "health.allergies.severity_MILD", "health.allergies.severity_MODERATE", "health.allergies.severity_SEVERE", "health.allergies.severity_UNKNOWN", "health.allergies.source",
  "health.conditions.title", "health.conditions.empty", "health.conditions.loadFailed", "health.conditions.saveFailed", "health.conditions.retry", "health.conditions.addCondition", "health.conditions.name", "health.conditions.notes", "health.conditions.status_ACTIVE", "health.conditions.status_RESOLVED", "health.conditions.status_HISTORICAL",
  "health.medications.title", "health.medications.empty", "health.medications.loadFailed", "health.medications.saveFailed", "health.medications.retry", "health.medications.addMedication", "health.medications.name", "health.medications.dosage", "health.medications.unit", "health.medications.status_ACTIVE", "health.medications.status_SCHEDULED", "health.medications.status_COMPLETED", "health.medications.status_HISTORICAL",
  "health.vaccinationSummary.title", "health.vaccinationSummary.loadFailed", "health.vaccinationSummary.saveFailed", "health.vaccinationSummary.retry", "health.vaccinationSummary.status", "health.vaccinationSummary.nextDueDate", "health.vaccinationSummary.lastKnownDate", "health.vaccinationSummary.notes", "health.vaccinationSummary.save",
  "health.recordDetail.back", "health.recordDetail.source", "health.recordDetail.recorded", "health.recordDetail.ownerNotice", "health.recordDetail.providerNotice", "health.recordDetail.condition", "health.recordDetail.allergy", "health.recordDetail.medication", "health.recordDetail.notes", "health.recordDetail.sourceLabel", "health.recordDetail.reaction", "health.recordDetail.severity", "health.recordDetail.knowledge", "health.recordDetail.dose", "health.recordDetail.frequency", "health.recordDetail.route", "health.recordDetail.instructions", "health.recordDetail.end", "health.recordDetail.unavailable", "health.recordDetail.retry", "health.recordDetail.loading",
  "rollout.records.clinical", "rollout.records.providerLocked", "rollout.records.correction", "rollout.records.reason", "rollout.records.edit", "rollout.records.remove", "rollout.records.name", "rollout.records.reaction", "rollout.records.instructions", "rollout.records.notes", "rollout.records.severity", "rollout.records.status", "rollout.records.save", "rollout.records.cancel", "rollout.records.failedSave", "rollout.records.correctionSaved", "rollout.records.saved", "rollout.records.confirmRemove", "rollout.records.statusLabels.ACTIVE", "rollout.records.statusLabels.RESOLVED", "rollout.records.statusLabels.HISTORICAL", "rollout.records.statusLabels.SCHEDULED", "rollout.records.statusLabels.COMPLETED",
] as const;

function getPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => (value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined), source);
}

describe("basic health translation coverage", () => {
  it.each(Object.entries(catalogs))("has explicit non-empty copy for every basic health key in %s", (locale, catalog) => {
    const missing = paths.filter((path) => typeof getPath(catalog, path) !== "string" || !(getPath(catalog, path) as string).trim());
    expect(missing, `${locale} missing keys: ${missing.join(", ")}`).toEqual([]);
  });
});
