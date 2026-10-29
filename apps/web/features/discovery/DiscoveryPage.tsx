import type { ReactNode } from "react";
import styles from "./DiscoveryPage.module.css";

/**
 * Shared public-discovery frame. It intentionally changes hierarchy and
 * density only; each domain keeps its existing search, eligibility and
 * booking behaviour instead of receiving invented product capabilities.
 */
export function DiscoveryPage({ children, kind }: { children: ReactNode; kind: "insurance" | "places" | "travel" | "services" }) {
  return <div className={`${styles.page} ${styles[`page_${kind}`]}`}>{children}</div>;
}
