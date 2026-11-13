import { DocumentVerificationStatus, DocumentVisibility, MedicalDocumentType } from "@petlife/types";
import type { RouteLocale } from "@/lib/i18n/config";

const TYPE: Record<MedicalDocumentType, Record<RouteLocale, string>> = {
  LAB_REPORT: { fa: "نتیجهٔ آزمایش", en: "Lab report", de: "Laborbericht", es: "Informe de laboratorio", ar: "تقرير مختبر", nl: "Labrapport" },
  IMAGING_REPORT: { fa: "گزارش تصویربرداری", en: "Imaging report", de: "Bildgebungsbericht", es: "Informe de diagnóstico por imagen", ar: "تقرير تصوير", nl: "Beeldvormingsverslag" },
  PRESCRIPTION: { fa: "نسخه", en: "Prescription", de: "Rezept", es: "Receta", ar: "وصفة طبية", nl: "Recept" },
  VACCINATION_CERTIFICATE: { fa: "کارت واکسن", en: "Vaccination certificate", de: "Impfbescheinigung", es: "Certificado de vacunación", ar: "شهادة تطعيم", nl: "Vaccinatiebewijs" },
  REFERRAL: { fa: "ارجاع", en: "Referral", de: "Überweisung", es: "Derivación", ar: "إحالة", nl: "Verwijzing" },
  DISCHARGE_SUMMARY: { fa: "خلاصهٔ ترخیص", en: "Discharge summary", de: "Entlassungsbericht", es: "Resumen de alta", ar: "ملخص الخروج", nl: "Ontslagbrief" },
  CLINICAL_NOTE: { fa: "یادداشت بالینی", en: "Clinical note", de: "Klinischer Bericht", es: "Nota clínica", ar: "ملاحظة سريرية", nl: "Klinische notitie" },
  DENTAL_RECORD: { fa: "پروندهٔ دندان", en: "Dental record", de: "Zahnmedizinische Akte", es: "Registro odontológico", ar: "سجل الأسنان", nl: "Gebitsdossier" },
  NUTRITION_PLAN: { fa: "برنامهٔ تغذیه", en: "Nutrition plan", de: "Ernährungsplan", es: "Plan nutricional", ar: "خطة التغذية", nl: "Voedingsplan" },
  REHAB_PLAN: { fa: "برنامهٔ توان‌بخشی", en: "Rehab plan", de: "Rehabilitationsplan", es: "Plan de rehabilitación", ar: "خطة إعادة التأهيل", nl: "Revalidatieplan" },
  TRAVEL_DOCUMENT: { fa: "مدرک سفر", en: "Travel document", de: "Reisedokument", es: "Documento de viaje", ar: "وثيقة سفر", nl: "Reisdocument" },
  OTHER: { fa: "سایر", en: "Other", de: "Sonstiges", es: "Otro", ar: "أخرى", nl: "Overig" },
};
const VISIBILITY: Record<DocumentVisibility, Record<RouteLocale, string>> = {
  HOUSEHOLD_ONLY: { fa: "فقط خانواده", en: "Household only", de: "Nur Haushalt", es: "Solo el hogar", ar: "الأسرة فقط", nl: "Alleen huishouden" },
  PROVIDER_SHARED: { fa: "به‌اشتراک‌گذاشته با دامپزشک", en: "Shared with provider", de: "Mit Tierarztpraxis geteilt", es: "Compartido con la clínica veterinaria", ar: "مُشارك مع مقدم الخدمة", nl: "Gedeeld met aanbieder" },
};
const VERIFICATION: Record<DocumentVerificationStatus, Record<RouteLocale, string>> = {
  UNVERIFIED: { fa: "ثبت‌شده توسط خانواده", en: "Added by household", de: "Vom Haushalt hinzugefügt", es: "Añadido por el hogar", ar: "أضافته الأسرة", nl: "Toegevoegd door huishouden" },
  PROVIDER_VERIFIED: { fa: "تأییدشده توسط مرکز درمانی", en: "Verified by provider", de: "Von der Tierarztpraxis bestätigt", es: "Verificado por la clínica veterinaria", ar: "تحقق منه مقدم الخدمة", nl: "Geverifieerd door aanbieder" },
};

const pick = <T extends string>(labels: Record<T, Record<RouteLocale, string>>, value: string, locale: RouteLocale, fallback: T) => labels[value as T]?.[locale] ?? labels[fallback][locale];
export const documentTypeLabel = (type: string, locale: RouteLocale) => pick(TYPE, type, locale, MedicalDocumentType.OTHER);
export const documentVisibilityLabel = (value: string, locale: RouteLocale) => pick(VISIBILITY, value, locale, DocumentVisibility.HOUSEHOLD_ONLY);
export const documentVerificationLabel = (value: string, locale: RouteLocale) => pick(VERIFICATION, value, locale, DocumentVerificationStatus.UNVERIFIED);
