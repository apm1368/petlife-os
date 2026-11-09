import { describe, expect, it } from "vitest";
import { bookingStatusLabel, categoryLabel, paymentModeLabel, providerTypeLabel } from "./labels";

describe("four-locale booking and discovery labels", () => {
  it("localizes a shared booking status without falling back to Persian", () => {
    const locales = ["fa", "en", "de", "es"] as const;
    expect(locales.map((locale) => bookingStatusLabel("CONFIRMED", locale)))
      .toEqual(["قطعی", "Confirmed", "Bestätigt", "Confirmada"]);
  });

  it("localizes service categories and provider types in every supported locale", () => {
    const locales = ["fa", "en", "de", "es"] as const;
    expect(locales.map((locale) => categoryLabel("VET", locale))).toEqual(["دامپزشکی", "Veterinary", "Tiermedizin", "Veterinaria"]);
    expect(locales.map((locale) => providerTypeLabel("VET_CLINIC", locale))).toEqual([
      "کلینیک دامپزشکی",
      "Veterinary clinic",
      "Tierarztpraxis",
      "Clínica veterinaria",
    ]);
  });

  it("localizes payment modes in every supported locale", () => {
    const locales = ["fa", "en", "de", "es"] as const;
    expect(locales.map((locale) => paymentModeLabel("DEPOSIT", locale))).toEqual([
      "پیش‌پرداخت آنلاین",
      "Online deposit",
      "Online-Anzahlung",
      "Anticipo en línea",
    ]);
  });
});
