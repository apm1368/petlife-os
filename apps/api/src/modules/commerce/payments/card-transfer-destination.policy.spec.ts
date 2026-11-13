import { luhnValid, maskCardNumber, maskSheba, normalizeCardNumber, normalizeSheba, shebaValid, validateDestination } from "./card-transfer-destination.policy";

describe("card-to-card destination rules", () => {
  it("accepts a 16-digit card with a valid Luhn checksum, in Persian digits or with separators", () => {
    expect(normalizeCardNumber("۶۰۳۷-۹۹۱۲-۳۴۵۶-۷۸۹۳")).toBe("6037991234567893");
    expect(luhnValid("6037991234567893")).toBe(true);
    expect(luhnValid("6037991234567890")).toBe(false);
    expect(normalizeCardNumber("6037 9912 3456")).toBeNull();
  });

  it("checks a Sheba with the IBAN mod-97 rule", () => {
    expect(normalizeSheba("ir05 0170 0000 0012 3456 7890 12")).toBe("IR050170000000123456789012");
    expect(shebaValid("IR050170000000123456789012")).toBe(true);
    expect(shebaValid("IR060170000000123456789012")).toBe(false);
    expect(normalizeSheba("IR0501700000001234")).toBeNull();
  });

  it("masks to the last four only", () => {
    expect(maskCardNumber("6037991234567893")).toBe("**** **** **** 7893");
    expect(maskSheba("IR050170000000123456789012")).toBe("IR** **** **** **** **** 9012");
    expect(maskCardNumber(null)).toBeNull();
  });

  it("needs a holder and a card or a Sheba, and names the first problem", () => {
    expect(validateDestination({ holderName: "شرکت پت لایف", cardNumber: "6037991234567893" })).toEqual({ ok: true, value: { cardNumber: "6037991234567893", sheba: null, holderName: "شرکت پت لایف", bankName: null } });
    expect(validateDestination({ holderName: "شرکت پت لایف" })).toEqual({ ok: false, problem: "CARD_OR_SHEBA_REQUIRED" });
    expect(validateDestination({ holderName: "x", cardNumber: "6037991234567893" })).toEqual({ ok: false, problem: "HOLDER_REQUIRED" });
    expect(validateDestination({ holderName: "شرکت پت لایف", cardNumber: "6037991234567890" })).toEqual({ ok: false, problem: "CARD_NUMBER_CHECKSUM" });
    expect(validateDestination({ holderName: "شرکت پت لایف", sheba: "IR060170000000123456789012" })).toEqual({ ok: false, problem: "SHEBA_CHECKSUM" });
  });
});
