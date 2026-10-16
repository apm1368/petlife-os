import Image from "next/image";
import styles from "./brand.module.css";

/** The owner's supplied symbol, with the explicitly approved product name. */
export function Brand({ compact = false }: { compact?: boolean }) {
  return <span className={styles.brand} dir="ltr">
    <Image className={styles.symbol} src="/brand/opetlife/02_symbol_only_transparent_approx.png" width={36} height={36} alt="" aria-hidden="true" />
    {!compact && <bdi>opetlife</bdi>}
  </span>;
}
