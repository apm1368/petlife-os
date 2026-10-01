/** Care reminder vocabulary shared by the Care Center and both calendars. */
export const CARE_KINDS: Record<string, [string, string]> = { VACCINATION:["واکسن","Vaccination"], VET_VISIT:["ویزیت دامپزشک","Vet visit"], LAB_TEST:["آزمایش","Lab test"], IMAGING:["تصویربرداری","Imaging"], DENTAL:["دندان","Dental"], MEDICATION:["دارو","Medication"], MEDICATION_REFILL:["تهیه مجدد دارو","Medication refill"], DEWORMING:["ضدانگل داخلی","Deworming"], PARASITE_PREVENTION:["پیشگیری از انگل","Parasite prevention"], FOLLOW_UP:["پیگیری","Follow-up"], WEIGHT_CHECK:["کنترل وزن","Weight check"], DOCUMENT_EXPIRY:["انقضای سند","Document expiry"], GROOMING:["آرایش و نظافت","Grooming"], CUSTOM:["شخصی","Custom"] };

/**
 * A reminder's title in the UI language. Reminders the system derives from the medical record are
 * stored with a fixed bilingual title ("واکسن / Vaccination"); they read as their kind instead.
 */
export function careTitle(item: { title: string; type?: string; source?: string }, locale: string): string {
  const ix = locale === "fa" ? 0 : 1;
  if (item.source === "MEDICAL_RECORD_DERIVED" && item.type && CARE_KINDS[item.type]) return CARE_KINDS[item.type]![ix]!;
  return item.title;
}
