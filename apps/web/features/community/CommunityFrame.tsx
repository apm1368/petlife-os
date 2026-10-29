import type { ReactNode } from "react";
import styles from "./CommunityFrame.module.css";

/** Shared editorial frame for real community content and conversations. */
export function CommunityFrame({ children }: { children: ReactNode }) {
  return <div className={styles.frame}>{children}</div>;
}
