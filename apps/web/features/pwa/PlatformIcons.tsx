/**
 * Platform marks drawn in-house for the app buttons (owner, 2026-11-13): monochrome, `currentColor`, 24×24.
 * The Android robot follows Google's CC BY 3.0 robot (credited on /credits); the iPhone mark is a plain apple
 * fruit, not Apple's logo, so it stays clear of Apple's trademark rules.
 */
type IconProps = { size?: number; className?: string };

export function AndroidIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" className={className}>
      <path d="M7.6 2.9l1.3 2.2M16.4 2.9l-1.3 2.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      <path fillRule="evenodd" d="M5.5 10.2a6.5 6.5 0 0 1 13 0zM8.4 7.6a.9.9 0 1 0 1.8 0a.9.9 0 1 0-1.8 0zM13.8 7.6a.9.9 0 1 0 1.8 0a.9.9 0 1 0-1.8 0z" />
      <path d="M5.5 11.2h13v7.3a1.5 1.5 0 0 1-1.5 1.5h-1.3v2.3a1.2 1.2 0 0 1-2.4 0V20h-2.6v2.3a1.2 1.2 0 0 1-2.4 0V20H7a1.5 1.5 0 0 1-1.5-1.5z" />
      <rect x="2.4" y="11.4" width="2.3" height="6.4" rx="1.15" />
      <rect x="19.3" y="11.4" width="2.3" height="6.4" rx="1.15" />
    </svg>
  );
}

export function AppleIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" className={className}>
      <path d="M12 7.6C10.6 6.6 8.9 6.3 7.4 6.8 4.6 7.8 3.6 11 4.4 14.3c.8 3.3 3 6.9 5.4 6.9.9 0 1.5-.5 2.2-.5s1.3.5 2.2.5c2.4 0 4.6-3.6 5.4-6.9.8-3.3-.2-6.5-3-7.5-1.5-.5-3.2-.2-4.6.8z" />
      <path d="M12 7.4c0-1.8.5-3.2 1.4-4.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <path d="M13 5.4c.4-2 2.2-3.2 4.4-3-.3 2-2.1 3.2-4.4 3z" />
    </svg>
  );
}
