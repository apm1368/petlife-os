/** Care reminder vocabulary shared by the Care Center and both calendars. */
export const CARE_KINDS: Record<string, [string, string, string, string, string, string]> = {
  VACCINATION: ["واکسن", "Vaccination", "Impfung", "Vacunación", "تطعيم", "Vaccinatie"],
  VET_VISIT: ["ویزیت دامپزشک", "Vet visit", "Tierarztbesuch", "Visita veterinaria", "زيارة الطبيب البيطري", "Dierenartsbezoek"],
  LAB_TEST: ["آزمایش", "Lab test", "Labortest", "Análisis de laboratorio", "فحص مخبري", "Labonderzoek"],
  IMAGING: ["تصویربرداری", "Imaging", "Bildgebung", "Diagnóstico por imagen", "تصوير طبي", "Beeldvorming"],
  DENTAL: ["دندان", "Dental", "Zahnbehandlung", "Dental", "الأسنان", "Gebit"],
  MEDICATION: ["دارو", "Medication", "Medikament", "Medicamento", "دواء", "Medicatie"],
  MEDICATION_REFILL: ["تهیه مجدد دارو", "Medication refill", "Medikament nachfüllen", "Reposición de medicamento", "تجديد الدواء", "Medicatie aanvullen"],
  DEWORMING: ["ضدانگل داخلی", "Deworming", "Entwurmung", "Desparasitación", "إزالة الديدان", "Ontworming"],
  PARASITE_PREVENTION: ["پیشگیری از انگل", "Parasite prevention", "Parasitenprophylaxe", "Prevención de parásitos", "الوقاية من الطفيليات", "Parasietpreventie"],
  FOLLOW_UP: ["پیگیری", "Follow-up", "Nachkontrolle", "Seguimiento", "متابعة", "Nacontrole"],
  WEIGHT_CHECK: ["کنترل وزن", "Weight check", "Gewichtskontrolle", "Control de peso", "فحص الوزن", "Gewichtscontrole"],
  DOCUMENT_EXPIRY: ["انقضای سند", "Document expiry", "Dokumentablauf", "Vencimiento del documento", "انتهاء صلاحية مستند", "Document verloopt"],
  GROOMING: ["آرایش و نظافت", "Grooming", "Fellpflege", "Aseo", "التجميل", "Vachtverzorging"],
  CUSTOM: ["شخصی", "Custom", "Benutzerdefiniert", "Personalizado", "مخصص", "Aangepast"],
};

/**
 * A reminder's title in the UI language. Reminders the system derives from the medical record are
 * stored with a fixed bilingual title ("واکسن / Vaccination"); they read as their kind instead.
 */
export function careTitle(item: { title: string; type?: string; source?: string }, locale: string): string {
  const ix = ({ fa: 0, en: 1, de: 2, es: 3, ar: 4, nl: 5 } as Record<string, number>)[locale] ?? 1;
  if (item.source === "MEDICAL_RECORD_DERIVED" && item.type && CARE_KINDS[item.type]) return CARE_KINDS[item.type]![ix]!;
  return item.title;
}
