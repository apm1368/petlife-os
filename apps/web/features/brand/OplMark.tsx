/** The approved opl mark: o is a cat, p is a dog, l is a sprout for life. Letters follow currentColor. */
export function OplMark({ className, title }: { className?: string; title?: string }) {
  return <svg className={className} viewBox="10 0 192 124" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
    <path d="M19.9 51.8 L16 27 L39.6 36.6 Z" fill="currentColor" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
    <path d="M76.1 51.8 L80 27 L56.4 36.6 Z" fill="currentColor" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
    <circle cx="48" cy="68" r="26" fill="none" stroke="currentColor" strokeWidth="13" />
    <g className="opl-mark__eyes"><ellipse cx="40.5" cy="65" rx="3" ry="3.6" fill="currentColor" /><ellipse cx="55.5" cy="65" rx="3" ry="3.6" fill="currentColor" /></g>
    <path d="M45 72 h6 l-3 3.6 z" fill="#F2B544" />
    <rect x="92" y="36" width="13" height="84" rx="6.5" fill="currentColor" />
    <circle cx="122" cy="68" r="26" fill="none" stroke="currentColor" strokeWidth="13" />
    <ellipse cx="157" cy="66" rx="6" ry="5" fill="var(--opl-mark-nose, #1E241F)" />
    <circle cx="130" cy="62" r="3.4" fill="currentColor" />
    <path className="opl-mark__ear" d="M109 38 C100 34 91 43 95 60 C98 72 106 77 110 70 C113 63 112 51 117 42 Z" fill="#F2B544" />
    <rect x="170" y="22" width="13" height="78.5" rx="6.5" fill="currentColor" />
    <path className="opl-mark__leaf" d="M176.5 26 C176 12 186 3 198 3 C198 16 190 25 176.5 26 Z" fill="#7DB46C" />
  </svg>;
}
