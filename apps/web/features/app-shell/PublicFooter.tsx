"use client";

import { useLocale } from "next-intl";

const labels = {
  fa: ["تماس با ما", "پرسش‌های متداول", "حریم خصوصی", "نماد اعتماد", "اینستاگرام", "فیسبوک", "واتس‌اپ", "بله"],
  en: ["Contact us", "FAQ", "Privacy", "Trust seal", "Instagram", "Facebook", "WhatsApp", "Bale"],
} as const;

export function PublicFooter() {
  const locale = useLocale() === "fa" ? "fa" : "en";
  return (
    <footer className="public-footer" aria-label={locale === "fa" ? "پیوندهای پایانی" : "Footer links"}>
      <bdi className="font-semibold">PET LIFE OS</bdi>
      <ul>{labels[locale].map((label) => <li key={label}><span aria-disabled="true">{label}</span></li>)}</ul>
    </footer>
  );
}
