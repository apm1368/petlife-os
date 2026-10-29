import type { ReactNode } from "react";
import styles from "./BookingFrame.module.css";

/**
 * Shared, content-first framing for the booking journey and the customer's
 * booking workspace. It deliberately adds no status, pet, or provider data:
 * those remain the real values returned by the booking APIs.
 */
export function BookingFrame({ children, journey = false }: { children: ReactNode; journey?: boolean }) {
  return <div className={journey ? `${styles.frame} ${styles.journey}` : styles.frame}>{children}</div>;
}
