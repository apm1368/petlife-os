import { describe, expect, it } from "vitest";
import { statusLabel, statusTone } from "./status-labels";
import { countryName, formatCount } from "@/lib/number/format-number";

describe("status vocabulary", () => {
  it("turns server codes into words in both languages; domains refine the meaning", () => {
    expect(statusLabel("FINAL", "fa", "lab")).toBe("نتیجهٔ نهایی");
    expect(statusLabel("ABNORMAL", "en", "labFlag")).toBe("Out of range");
    expect(statusLabel("DUE_SOON", "fa", "vaccination")).toBe("به‌زودی سررسید");
    expect(statusLabel("MEMORIAL", "en", "lifecycle")).toBe("In memory");
    expect(statusLabel("ACTIVE", "fa", "plan")).toBe("در حال اجرا");
    expect(statusLabel("ACTIVE", "fa")).toBe("فعال");
  });

  it("an unknown code is never printed as a raw constant", () => {
    expect(statusLabel("SOME_NEW_CODE", "en")).toBe("Some new code");
    expect(statusLabel(null, "fa")).toBe("");
  });

  it("tones follow meaning, not the code text", () => {
    expect(statusTone("OVERDUE", "vaccination")).toBe("urgent");
    expect(statusTone("UP_TO_DATE", "vaccination")).toBe("success");
    expect(statusTone("WHATEVER")).toBe("neutral");
  });

  it("counts and country names follow the UI language", () => {
    expect(formatCount(1250, "fa")).toBe("۱٬۲۵۰");
    expect(formatCount(1250, "en")).toBe("1,250");
    expect(countryName("IR", "fa")).toBe("ایران");
    expect(countryName("IR", "en")).toBe("Iran");
  });
});
