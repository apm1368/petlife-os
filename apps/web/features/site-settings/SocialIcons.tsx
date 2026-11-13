/**
 * Social network marks for the footer and the member dashboard (owner, 2026-11-13), drawn in-house: 24×24,
 * monochrome currentColor, no brand files, no remote images, no embeds. Each is a simplified, recognisable sign.
 */
import type { SocialNetwork } from "./public-links";

const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function SocialIcon({ network, size = 22 }: { network: SocialNetwork; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {network === "instagram" ? (
        <>
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" {...STROKE} />
          <circle cx="12" cy="12" r="4" {...STROKE} />
          <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" />
        </>
      ) : network === "telegram" ? (
        <path d="M20.5 4.2 3.6 10.8c-.6.2-.6 1.1 0 1.3l4.2 1.4 1.6 5c.2.6.9.7 1.3.3l2.4-2.3 4.3 3.1c.5.4 1.2.1 1.4-.5l2.9-13.2c.1-.6-.5-1.1-1.2-.7ZM8 13.4l9.3-6-7.2 7.1-.3 3" {...STROKE} />
      ) : network === "whatsapp" ? (
        <>
          <path d="M4.3 19.7 5.5 16A8.2 8.2 0 1 1 8.2 18.6Z" {...STROKE} />
          <path d="M9.4 8.4c.3-.3.7-.3.9 0l.8 1.5c.1.3.1.5-.1.7l-.5.6c.5 1 1.3 1.8 2.3 2.3l.6-.5c.2-.2.5-.2.7-.1l1.5.8c.3.2.3.6 0 .9-.6.6-1.5.8-2.3.5a7.9 7.9 0 0 1-4.3-4.3c-.3-.8-.1-1.7.4-2.4Z" fill="currentColor" />
        </>
      ) : network === "bale" ? (
        <>
          <path d="M12 3.5a8.5 8.5 0 1 1 0 17H4.5V12A8.5 8.5 0 0 1 12 3.5Z" {...STROKE} />
          <path d="m8.4 12.2 2.4 2.4 4.8-5" {...STROKE} />
        </>
      ) : network === "youtube" ? (
        <>
          <rect x="2.8" y="5.5" width="18.4" height="13" rx="4" {...STROKE} />
          <path d="M10.2 9.3v5.4l4.6-2.7Z" fill="currentColor" />
        </>
      ) : network === "aparat" ? (
        <>
          <circle cx="12" cy="12" r="8.5" {...STROKE} />
          {[[12, 7.4], [16.6, 12], [12, 16.6], [7.4, 12]].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.7" fill="currentColor" />)}
        </>
      ) : network === "x" ? (
        <path d="M4.5 4.5h4.1l10.9 15h-4.1ZM19 4.5l-5.7 6.4M5 19.5l5.7-6.4" {...STROKE} />
      ) : (
        <>
          <rect x="3.5" y="3.5" width="17" height="17" rx="3" {...STROKE} />
          <path d="M8 10.6v5.9M8 7.7v.1M11.6 16.5v-5.9M11.6 13.1c0-1.6 1-2.6 2.3-2.6s2.1 1 2.1 2.6v3.4" {...STROKE} />
        </>
      )}
    </svg>
  );
}
