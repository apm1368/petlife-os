/**
 * The company account members pay into by card-to-card. The owner manages it in admin; because swapping it for
 * another card would divert every payment, it is validated strictly and only ever shown masked outside the active
 * payment screen.
 */

const toLatinDigits = (value: string) =>
  value.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

/** 16 digits with separators/Persian digits removed, or null when it is not 16 digits. */
export function normalizeCardNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = toLatinDigits(raw).replace(/[\s\-–_.]/g, "");
  return /^\d{16}$/.test(digits) ? digits : null;
}

/** Luhn checksum, which every Shetab card number satisfies. */
export function luhnValid(digits: string): boolean {
  if (!/^\d{12,19}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** "IR" + 24 digits (spaces and Persian digits tolerated), or null. */
export function normalizeSheba(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const compact = toLatinDigits(raw).replace(/[\s\-]/g, "").toUpperCase();
  const withPrefix = /^\d{24}$/.test(compact) ? `IR${compact}` : compact;
  return /^IR\d{24}$/.test(withPrefix) ? withPrefix : null;
}

/** ISO 13616 IBAN check: move the first four characters to the end, letters to numbers, remainder mod 97 must be 1. */
export function shebaValid(iban: string): boolean {
  if (!/^IR\d{24}$/.test(iban)) return false;
  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const ch of rearranged) remainder = (remainder * 10 + Number(ch)) % 97;
  return remainder === 1;
}

export const formatCardNumber = (digits: string) => digits.replace(/(\d{4})(?=\d)/g, "$1-");
export const maskCardNumber = (digits: string | null | undefined) => (digits ? `**** **** **** ${digits.slice(-4)}` : null);
export const maskSheba = (iban: string | null | undefined) => (iban ? `IR** **** **** **** **** ${iban.slice(-4)}` : null);

export interface DestinationInput {
  cardNumber?: string | null;
  sheba?: string | null;
  holderName: string;
  bankName?: string | null;
}

export type DestinationProblem = "CARD_NUMBER_INVALID" | "CARD_NUMBER_CHECKSUM" | "SHEBA_INVALID" | "SHEBA_CHECKSUM" | "CARD_OR_SHEBA_REQUIRED" | "HOLDER_REQUIRED";

/** Normalised values, or the first problem. A card number is what card-to-card needs; a Sheba alone is allowed but opens no card rail. */
export function validateDestination(input: DestinationInput): { ok: true; value: { cardNumber: string | null; sheba: string | null; holderName: string; bankName: string | null } } | { ok: false; problem: DestinationProblem } {
  const rawCard = input.cardNumber?.trim() || null;
  const rawSheba = input.sheba?.trim() || null;
  const holderName = input.holderName?.trim().replace(/\s+/g, " ") ?? "";
  if (holderName.length < 3 || holderName.length > 120) return { ok: false, problem: "HOLDER_REQUIRED" };
  if (!rawCard && !rawSheba) return { ok: false, problem: "CARD_OR_SHEBA_REQUIRED" };
  let cardNumber: string | null = null;
  if (rawCard) {
    cardNumber = normalizeCardNumber(rawCard);
    if (!cardNumber) return { ok: false, problem: "CARD_NUMBER_INVALID" };
    if (!luhnValid(cardNumber)) return { ok: false, problem: "CARD_NUMBER_CHECKSUM" };
  }
  let sheba: string | null = null;
  if (rawSheba) {
    sheba = normalizeSheba(rawSheba);
    if (!sheba) return { ok: false, problem: "SHEBA_INVALID" };
    if (!shebaValid(sheba)) return { ok: false, problem: "SHEBA_CHECKSUM" };
  }
  const bankName = input.bankName?.trim().slice(0, 80) || null;
  return { ok: true, value: { cardNumber, sheba, holderName, bankName } };
}
