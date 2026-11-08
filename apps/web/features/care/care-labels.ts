/** Care reminder vocabulary shared by the Care Center, calendar, profile and year review. */
export const CARE_KINDS: Record<string, readonly [string, string, string, string]> = {
  VACCINATION: ["واکسن", "Vaccination", "Impfung", "Vacunación"],
  VET_VISIT: ["ویزیت دامپزشک", "Vet visit", "Tierarztbesuch", "Visita veterinaria"],
  LAB_TEST: ["آزمایش", "Lab test", "Labortest", "Análisis de laboratorio"],
  IMAGING: ["تصویربرداری", "Imaging", "Bildgebung", "Diagnóstico por imagen"],
  DENTAL: ["دندان", "Dental", "Zahnbehandlung", "Odontología"],
  MEDICATION: ["دارو", "Medication", "Medikament", "Medicamento"],
  MEDICATION_REFILL: ["تهیه مجدد دارو", "Medication refill", "Medikament nachfüllen", "Renovar medicamento"],
  DEWORMING: ["ضدانگل داخلی", "Deworming", "Entwurmung", "Desparasitación interna"],
  PARASITE_PREVENTION: ["پیشگیری از انگل", "Parasite prevention", "Parasitenprophylaxe", "Prevención de parásitos"],
  FOLLOW_UP: ["پیگیری", "Follow-up", "Nachkontrolle", "Seguimiento"],
  WEIGHT_CHECK: ["کنترل وزن", "Weight check", "Gewichtskontrolle", "Control de peso"],
  DOCUMENT_EXPIRY: ["انقضای سند", "Document expiry", "Dokument läuft ab", "Vencimiento de documento"],
  GROOMING: ["آرایش و نظافت", "Grooming", "Fellpflege", "Peluquería"],
  CUSTOM: ["شخصی", "Custom", "Eigener Eintrag", "Personalizado"],
};

const LOCALE_INDEX: Record<string, number> = { fa: 0, en: 1, de: 2, es: 3 };

export function careKindLabel(type: string, locale: string): string {
  return CARE_KINDS[type]?.[LOCALE_INDEX[locale] ?? 1] ?? type;
}

/**
 * A reminder's title in the UI language. Reminders the system derives from the medical record are
 * stored with a fixed bilingual title ("واکسن / Vaccination"); they read as their kind instead.
 */
export function careTitle(item: { title: string; type?: string; source?: string }, locale: string): string {
  if (item.source === "MEDICAL_RECORD_DERIVED" && item.type && CARE_KINDS[item.type]) return careKindLabel(item.type, locale);
  return item.title;
}
