import { normalizeIranPhone } from "../../../../../packages/validation/src/digits";
import { maskPhone, normalizeIranianPhone } from "./phone-normalizer";

describe("normalizeIranianPhone", () => {
  const forms = ["09121234567", "9121234567", "+989121234567", "00989121234567", "۰۹۱۲۱۲۳۴۵۶۷", "٠٩١٢١٢٣٤٥٦٧", " 0912 123 4567 ", "(0912) 123-4567"];

  it.each(forms)("%s → +989121234567", (input) => {
    expect(normalizeIranianPhone(input)).toEqual({ e164: "+989121234567", countryCode: "IR" });
  });

  it.each(["02112345678", "0912123456", "091212345678", "+15555550100", "989121234567x", "", "abc"])("rejects %s", (input) => {
    expect(normalizeIranianPhone(input)).toBeNull();
  });

  it("agrees with @petlife/validation's normalizeIranPhone (what the web client sends)", () => {
    for (const input of [...forms, "02112345678", "+15555550100", "989121234567", "0098 912 123 4567", ""]) {
      expect(normalizeIranianPhone(input)?.e164 ?? null).toBe(normalizeIranPhone(input));
    }
  });

  it("masks an E.164 number", () => {
    expect(maskPhone("+989121234567")).toBe("+98********67");
  });
});
