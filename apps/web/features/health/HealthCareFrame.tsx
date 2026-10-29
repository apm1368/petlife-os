import type { ReactNode } from "react";
import styles from "./HealthCareFrame.module.css";

/** Shared frame for real health, care and calendar data — no synthetic clinical context. */
export function HealthCareFrame({ children }: { children: ReactNode }) {
  return <div className={styles.frame}>{children}</div>;
}
