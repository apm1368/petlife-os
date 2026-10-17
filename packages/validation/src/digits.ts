/** Convert Persian and Arabic-Indic digits while preserving other characters. */
export function toAsciiDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
  });
}

/** Normalize an Iranian mobile number; reject invalid numbers and other text. */
export function normalizeIranPhone(value: string): string | null {
  const phone = toAsciiDigits(value).trim().replace(/[\s()-]/g, "");
  if (/^09\d{9}$/.test(phone)) return `+98${phone.slice(1)}`;
  if (/^9\d{9}$/.test(phone)) return `+98${phone}`;
  if (/^\+989\d{9}$/.test(phone)) return phone;
  if (/^00989\d{9}$/.test(phone)) return `+${phone.slice(2)}`;
  return null;
}
