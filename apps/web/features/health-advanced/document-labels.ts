import { DocumentVerificationStatus, DocumentVisibility, MedicalDocumentType } from "@petlife/types";
import type { RouteLocale } from "@/lib/i18n/config";

const TYPE: Record<MedicalDocumentType, Record<RouteLocale, string>> = {
  LAB_REPORT: { fa: "نتیجهٔ آزمایش", en: "Lab report", de: "Laborbericht", es: "Informe de laboratorio" },
  IMAGING_REPORT: { fa: "گزارش تصویربرداری", en: "Imaging report", de: "Bildgebungsbericht", es: "Informe de diagnóstico por imagen" },
  PRESCRIPTION: { fa: "نسخه", en: "Prescription", de: "Rezept", es: "Receta" },
  VACCINATION_CERTIFICATE: { fa: "کارت واکسن", en: "Vaccination certificate", de: "Impfbescheinigung", es: "Certificado de vacunación" },
  REFERRAL: { fa: "ارجاع", en: "Referral", de: "Überweisung", es: "Derivación" },
  DISCHARGE_SUMMARY: { fa: "خلاصهٔ ترخیص", en: "Discharge summary", de: "Entlassungsbericht", es: "Resumen de alta" },
  CLINICAL_NOTE: { fa: "یادداشت بالینی", en: "Clinical note", de: "Klinischer Bericht", es: "Nota clínica" },
  DENTAL_RECORD: { fa: "پروندهٔ دندان", en: "Dental record", de: "Zahnmedizinische Akte", es: "Registro odontológico" },
  NUTRITION_PLAN: { fa: "برنامهٔ تغذیه", en: "Nutrition plan", de: "Ernährungsplan", es: "Plan nutricional" },
  REHAB_PLAN: { fa: "برنامهٔ توان‌بخشی", en: "Rehab plan", de: "Rehabilitationsplan", es: "Plan de rehabilitación" },
  TRAVEL_DOCUMENT: { fa: "مدرک سفر", en: "Travel document", de: "Reisedokument", es: "Documento de viaje" },
  OTHER: { fa: "سایر", en: "Other", de: "Sonstiges", es: "Otro" },
};
const VISIBILITY: Record<DocumentVisibility, Record<RouteLocale, string>> = {
  HOUSEHOLD_ONLY: { fa: "فقط خانواده", en: "Household only", de: "Nur Haushalt", es: "Solo el hogar" },
  PROVIDER_SHARED: { fa: "به‌اشتراک‌گذاشته با دامپزشک", en: "Shared with provider", de: "Mit Tierarztpraxis geteilt", es: "Compartido con la clínica veterinaria" },
};
const VERIFICATION: Record<DocumentVerificationStatus, Record<RouteLocale, string>> = {
  UNVERIFIED: { fa: "ثبت‌شده توسط خانواده", en: "Added by household", de: "Vom Haushalt hinzugefügt", es: "Añadido por el hogar" },
  PROVIDER_VERIFIED: { fa: "تأییدشده توسط مرکز درمانی", en: "Verified by provider", de: "Von der Tierarztpraxis bestätigt", es: "Verificado por la clínica veterinaria" },
};

const pick = <T extends string>(labels: Record<T, Record<RouteLocale, string>>, value: string, locale: RouteLocale, fallback: T) => labels[value as T]?.[locale] ?? labels[fallback][locale];
export const documentTypeLabel = (type: string, locale: RouteLocale) => pick(TYPE, type, locale, MedicalDocumentType.OTHER);
export const documentVisibilityLabel = (value: string, locale: RouteLocale) => pick(VISIBILITY, value, locale, DocumentVisibility.HOUSEHOLD_ONLY);
export const documentVerificationLabel = (value: string, locale: RouteLocale) => pick(VERIFICATION, value, locale, DocumentVerificationStatus.UNVERIFIED);
