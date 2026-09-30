import type { DocumentVerificationStatus, DocumentVisibility, MedicalDocumentType } from "@petlife/types";

type Locale = "fa" | "en";

const TYPE: Record<MedicalDocumentType, [string, string]> = {
  LAB_REPORT: ["نتیجهٔ آزمایش", "Lab report"],
  IMAGING_REPORT: ["گزارش تصویربرداری", "Imaging report"],
  PRESCRIPTION: ["نسخه", "Prescription"],
  VACCINATION_CERTIFICATE: ["کارت واکسن", "Vaccination certificate"],
  REFERRAL: ["ارجاع", "Referral"],
  DISCHARGE_SUMMARY: ["خلاصهٔ ترخیص", "Discharge summary"],
  CLINICAL_NOTE: ["یادداشت بالینی", "Clinical note"],
  DENTAL_RECORD: ["پروندهٔ دندان", "Dental record"],
  NUTRITION_PLAN: ["برنامهٔ تغذیه", "Nutrition plan"],
  REHAB_PLAN: ["برنامهٔ توان‌بخشی", "Rehab plan"],
  TRAVEL_DOCUMENT: ["مدرک سفر", "Travel document"],
  OTHER: ["سایر", "Other"],
};
const VISIBILITY: Record<DocumentVisibility, [string, string]> = {
  HOUSEHOLD_ONLY: ["فقط خانواده", "Household only"],
  PROVIDER_SHARED: ["به‌اشتراک‌گذاشته با دامپزشک", "Shared with provider"],
};
const VERIFICATION: Record<DocumentVerificationStatus, [string, string]> = {
  UNVERIFIED: ["ثبت‌شده توسط خانواده", "Added by household"],
  PROVIDER_VERIFIED: ["تأییدشده توسط مرکز درمانی", "Verified by provider"],
};

const pick = (pair: [string, string] | undefined, locale: Locale, fallback: string) => (pair ? pair[locale === "fa" ? 0 : 1] : fallback);
export const documentTypeLabel = (type: string, locale: Locale) => pick(TYPE[type as MedicalDocumentType], locale, type);
export const documentVisibilityLabel = (value: string, locale: Locale) => pick(VISIBILITY[value as DocumentVisibility], locale, value);
export const documentVerificationLabel = (value: string, locale: Locale) => pick(VERIFICATION[value as DocumentVerificationStatus], locale, value);
