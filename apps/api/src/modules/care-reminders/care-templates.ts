/**
 * Deterministic care templates. They are suggestions the member reviews and confirms item by item — nothing is
 * created until the apply call carries the confirmed items. Medical intervals are only editable defaults, always
 * labelled "confirm with your vet"; no interval is ever inferred from a pet's record.
 */
export interface CareTemplateItem {
  key: string;
  type: string;
  title: { fa: string; en: string };
  recurrence: string;
  intervalDays?: number;
  weekdays?: number[];
  /** Days after the chosen start for the first occurrence. */
  offsetDays: number;
  /** True for items whose timing is a clinical decision. */
  confirmWithVet: boolean;
}
export interface CareTemplate {
  key: string;
  title: { fa: string; en: string };
  description: { fa: string; en: string };
  items: CareTemplateItem[];
}

export const CARE_TEMPLATES: CareTemplate[] = [
  {
    key: "parasite-prevention",
    title: { fa: "پیشگیری از انگل", en: "Parasite prevention" },
    description: { fa: "ضدکک و کنه ماهانه و ضدانگل داخلی دوره‌ای. فاصله‌ها را با دامپزشک تأیید کنید.", en: "Monthly flea/tick and periodic deworming. Confirm the intervals with your vet." },
    items: [
      { key: "flea-tick", type: "PARASITE_PREVENTION", title: { fa: "ضدکک و کنه", en: "Flea and tick prevention" }, recurrence: "MONTHLY", offsetDays: 0, confirmWithVet: true },
      { key: "deworming", type: "DEWORMING", title: { fa: "ضدانگل داخلی", en: "Deworming" }, recurrence: "CUSTOM", intervalDays: 90, offsetDays: 0, confirmWithVet: true },
    ],
  },
  {
    key: "vaccination-booster",
    title: { fa: "یادآور واکسن سالانه", en: "Annual vaccine booster" },
    description: { fa: "یادآور سالانه برای تمدید واکسن. نوع و زمان واکسن را دامپزشک تعیین می‌کند.", en: "A yearly booster reminder. Your vet decides the vaccine and timing." },
    items: [{ key: "annual-booster", type: "VACCINATION", title: { fa: "تمدید واکسن سالانه", en: "Annual vaccine booster" }, recurrence: "YEARLY", offsetDays: 0, confirmWithVet: true }],
  },
  {
    key: "medication-course",
    title: { fa: "دوره‌ی دارو", en: "Medication course" },
    description: { fa: "یادآور روزانه تا پایان دوره. تعداد دفعات را طبق نسخه وارد کنید.", en: "A daily reminder until the course ends. Enter the number of doses from the prescription." },
    items: [{ key: "dose", type: "MEDICATION", title: { fa: "نوبت دارو", en: "Medication dose" }, recurrence: "DAILY", offsetDays: 0, confirmWithVet: true }],
  },
  {
    key: "grooming",
    title: { fa: "آراستگی", en: "Grooming" },
    description: { fa: "حمام و کوتاه کردن ناخن.", en: "Bath and nail trimming." },
    items: [
      { key: "bath", type: "GROOMING", title: { fa: "حمام", en: "Bath" }, recurrence: "CUSTOM", intervalDays: 30, offsetDays: 0, confirmWithVet: false },
      { key: "nails", type: "GROOMING", title: { fa: "کوتاه کردن ناخن", en: "Nail trim" }, recurrence: "CUSTOM", intervalDays: 21, offsetDays: 7, confirmWithVet: false },
    ],
  },
  {
    key: "dental-care",
    title: { fa: "مراقبت از دندان", en: "Dental care" },
    description: { fa: "مسواک چند بار در هفته و معاینه‌ی دندان سالانه.", en: "Brushing a few times a week and a yearly dental check." },
    items: [
      { key: "brushing", type: "DENTAL", title: { fa: "مسواک زدن", en: "Tooth brushing" }, recurrence: "WEEKDAYS", weekdays: [0, 2, 4], offsetDays: 0, confirmWithVet: false },
      { key: "dental-check", type: "DENTAL", title: { fa: "معاینه‌ی دندان", en: "Dental check" }, recurrence: "YEARLY", offsetDays: 30, confirmWithVet: true },
    ],
  },
  {
    key: "weight-check",
    title: { fa: "کنترل وزن", en: "Weight check" },
    description: { fa: "ثبت ماهانه‌ی وزن برای دیدن روند.", en: "Monthly weigh-in to see the trend." },
    items: [{ key: "weigh", type: "WEIGHT_CHECK", title: { fa: "وزن‌کشی", en: "Weigh-in" }, recurrence: "MONTHLY", offsetDays: 0, confirmWithVet: false }],
  },
];
