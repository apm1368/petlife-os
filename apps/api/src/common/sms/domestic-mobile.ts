/** Iranian SMS gateways (Faraz, Kavenegar) take mobiles in the domestic 09xxxxxxxxx form, not E.164. */
export function toDomesticMobile(value: string): string | null {
  if (/^\+989\d{9}$/.test(value)) return `0${value.slice(3)}`;
  if (/^09\d{9}$/.test(value)) return value;
  return null;
}
