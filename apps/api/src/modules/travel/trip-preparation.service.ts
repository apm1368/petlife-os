import { Injectable } from "@nestjs/common";
import { InsuranceApplicationStatus, MedicalDocumentType, MedicationStatus, TripChecklistState } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import { CareReminderService } from "../care-reminders/care-reminder.service";
import { TravelRequirementService } from "./travel-requirement.service";

const DAY = 86400e3;
type Locale = "fa" | "en";
const T = {
  VACCINATION_CHECK: { fa: "بررسی واکسن پیش از سفر", en: "Check vaccinations before the trip" },
  HEALTH_CERTIFICATE: { fa: "گرفتن گواهی سلامت برای سفر", en: "Get a health certificate for the trip" },
  MEDICATION_REFILL: { fa: "تهیه‌ی داروی کافی برای سفر", en: "Refill medication for the trip" },
  PACKING: { fa: "تکمیل چک‌لیست سفر", en: "Finish the trip checklist" },
} as const;
export type TripProposalKey = keyof typeof T;

/**
 * Cross-domain chain #4 — trip → readiness → documents → checklist → insurance → reminders. One deterministic view
 * that joins what already exists. Readiness items here are ADVISORY (never presented as airline or legal rules);
 * rule-sourced requirements stay in TravelRequirement with their own source. Reminder proposals are created only for
 * the keys the member confirms, through the normal care reminder path (plan entitlement applies), never twice.
 */
@Injectable()
export class TripPreparationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly care: CareReminderService,
    private readonly requirements: TravelRequirementService,
  ) {}

  async preparation(petId: string, tripId: string, locale: Locale, now = new Date()) {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, petId } });
    if (!trip) throw new NotFoundApiException("Trip");
    const [pet, vaccination, certificates, travelDocs, activeMeds, checklist, linked, applications, claimPreps, req] = await Promise.all([
      this.prisma.pet.findUniqueOrThrow({ where: { id: petId }, select: { microchipNumber: true } }),
      this.prisma.vaccinationSummary.findUnique({ where: { petId }, select: { status: true, nextDueDate: true } }),
      this.prisma.medicalDocument.count({ where: { petId, voidedAt: null, documentType: MedicalDocumentType.VACCINATION_CERTIFICATE } }),
      this.prisma.medicalDocument.count({ where: { petId, voidedAt: null, documentType: MedicalDocumentType.TRAVEL_DOCUMENT } }),
      this.prisma.medication.count({ where: { petId, status: MedicationStatus.ACTIVE } }),
      this.prisma.tripChecklistItem.findMany({ where: { tripId }, select: { category: true, state: true } }),
      this.prisma.tripDocumentLink.count({ where: { tripId } }),
      this.prisma.insuranceApplication.findMany({ where: { petId }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, status: true, product: { select: { name: true } } } }),
      this.prisma.insuranceClaimPrep.count({ where: { petId } }),
      this.requirements.getReadinessSummary(petId, tripId),
    ]);
    const tripEnd = trip.returnAt ?? trip.departAt;
    const checklistOf = (category: string) => checklist.filter((c) => c.category === category);
    const categoryDone = (category: string) => {
      const items = checklistOf(category);
      if (!items.length) return "UNKNOWN" as const;
      return items.every((i) => i.state !== TripChecklistState.TODO) ? ("MET" as const) : ("NOT_MET" as const);
    };
    const vaccinesCovered = vaccination?.status === "UP_TO_DATE" && (!vaccination.nextDueDate || vaccination.nextDueDate > tripEnd);
    const insured = applications.some((a) => a.status === InsuranceApplicationStatus.APPROVED);
    const items = [
      { key: "MICROCHIP", status: pet.microchipNumber ? "MET" : "NOT_MET" },
      { key: "VACCINATION_CERTIFICATE", status: certificates > 0 || vaccinesCovered ? "MET" : vaccination ? "NOT_MET" : "UNKNOWN" },
      { key: "HEALTH_CERTIFICATE", status: travelDocs > 0 ? "MET" : "NOT_MET" },
      { key: "CARRIER", status: categoryDone("CARRIER") },
      { key: "MEDICATION", status: activeMeds === 0 ? "NOT_APPLICABLE" : categoryDone("MEDICATION") },
      { key: "INSURANCE", status: insured ? "MET" : "NOT_MET" },
    ];
    return {
      trip: { id: trip.id, status: trip.status, departAt: trip.departAt.toISOString(), returnAt: trip.returnAt?.toISOString() ?? null, destinationCountry: trip.destinationCountry, destinationCity: trip.destinationCity },
      readiness: { authority: "ADVISORY" as const, items },
      requirements: { readyCount: req.readyCount, totalCount: req.totalCount, allReady: req.allReady, hasStaleRequirement: req.hasStaleRequirement },
      checklist: { total: checklist.length, todo: checklist.filter((c) => c.state === TripChecklistState.TODO).length, done: checklist.filter((c) => c.state === TripChecklistState.DONE).length, notRequired: checklist.filter((c) => c.state === TripChecklistState.NOT_REQUIRED).length },
      documents: { linkedCount: linked },
      insurance: { insured, applications: applications.map((a) => ({ id: a.id, status: a.status, productName: a.product.name })), claimPrepCount: claimPreps },
      reminderProposals: this.proposals(trip.departAt, now, locale, { vaccinesCovered, hasHealthCertificate: travelDocs > 0, activeMeds, openChecklist: checklist.some((c) => c.state === TripChecklistState.TODO) }),
    };
  }

  private proposals(departAt: Date, now: Date, locale: Locale, f: { vaccinesCovered: boolean; hasHealthCertificate: boolean; activeMeds: number; openChecklist: boolean }) {
    if (departAt <= now) return [];
    const due = (daysBefore: number) => new Date(Math.max(departAt.getTime() - daysBefore * DAY, now.getTime() + 3600e3)).toISOString();
    const out: { key: TripProposalKey; title: string; type: string; dueAt: string }[] = [];
    if (!f.vaccinesCovered) out.push({ key: "VACCINATION_CHECK", title: T.VACCINATION_CHECK[locale], type: "VACCINATION", dueAt: due(14) });
    if (!f.hasHealthCertificate) out.push({ key: "HEALTH_CERTIFICATE", title: T.HEALTH_CERTIFICATE[locale], type: "VET_VISIT", dueAt: due(10) });
    if (f.activeMeds > 0) out.push({ key: "MEDICATION_REFILL", title: T.MEDICATION_REFILL[locale], type: "MEDICATION_REFILL", dueAt: due(3) });
    if (f.openChecklist) out.push({ key: "PACKING", title: T.PACKING[locale], type: "CUSTOM", dueAt: due(1) });
    return out;
  }

  /** Creates reminders for the confirmed proposal keys only; a proposal already turned into a reminder is skipped. */
  async applyProposals(petId: string, tripId: string, userId: string, locale: Locale, keys: TripProposalKey[]) {
    const prep = await this.preparation(petId, tripId, locale);
    const chosen = prep.reminderProposals.filter((p) => keys.includes(p.key));
    if (!chosen.length) throw new ValidationApiException({ field: "keys", reason: "NO_CURRENT_PROPOSAL" });
    const created = [];
    for (const p of chosen) {
      const exists = await this.prisma.careReminder.count({ where: { petId, title: p.title, type: p.type, dueAt: new Date(p.dueAt), state: { notIn: ["CANCELLED"] } } });
      if (exists) continue;
      created.push(await this.care.create(petId, userId, { title: p.title, type: p.type, dueAt: p.dueAt }));
    }
    return { created: created.map((c) => ({ id: c.id, title: c.title, dueAt: c.dueAt })), skipped: chosen.length - created.length };
  }
}
