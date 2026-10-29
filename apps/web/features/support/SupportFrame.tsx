import type { ReactNode } from "react";
import styles from "./SupportFrame.module.css";

/** A shared frame for support cases; it never creates a synthetic case state. */
export function SupportFrame({ children }: { children: ReactNode }) {
  return <div className={styles.frame}>{children}</div>;
}
