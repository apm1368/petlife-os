/**
 * PII masking for internal-platform surfaces (Handoff 11 spec: "PII masking
 * by default, with audited reveal for authorized roles"). Complements
 * `maskPhone` (common/phone/phone-normalizer.ts, Handoff 10) with the email
 * equivalent — kept as its own module rather than folded into the phone
 * utility, since email has no normalization step to share.
 */

/** Masks an email for logs/admin list views, e.g. "p***@gmail.com" — never the full local part (mirrors maskPhone's "never expose the full value unnecessarily"). */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "*".repeat(email.length);
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(local.length - 1, 3))}@${domain}`;
}
