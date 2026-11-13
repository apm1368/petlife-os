import type { RouteLocale } from "@/lib/i18n/config";
import { OplMark } from "./OplMark";
import styles from "./brand.module.css";

/** The approved opl mark with the localized wordmark: «اپت لایف» in Persian, «opetlife» elsewhere. */
export function Brand({ compact = false, locale }: { compact?: boolean; locale?: RouteLocale }) {
  const persian = locale === "fa";
  return <span className={styles.brand} dir={persian ? "rtl" : "ltr"}>
    <OplMark className={styles.symbol} />
    {!compact && <bdi className={persian ? styles.wordFa : styles.wordLatin}>{persian ? "اپت لایف" : "opetlife"}</bdi>}
  </span>;
}
