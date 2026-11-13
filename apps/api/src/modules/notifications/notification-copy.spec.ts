import { notificationCopyFor, TEMPLATE_PARAMS_METADATA_KEY } from "./notification-templates";

describe("notificationCopyFor", () => {
  const faRow = { type: "account.deletion_ready", locale: "fa", title: "حذف حساب شما آمادهٔ اجراست", body: "…", metadata: null };

  it("returns the stored copy when the reader's language matches or none is given", () => {
    expect(notificationCopyFor(faRow, "fa")).toEqual({ title: faRow.title, body: faRow.body });
    expect(notificationCopyFor(faRow, undefined)).toEqual({ title: faRow.title, body: faRow.body });
  });

  it("re-renders a parameterless template in English for en/de/es/ar/nl readers", () => {
    for (const locale of ["en", "de", "es", "ar", "nl"]) {
      expect(notificationCopyFor(faRow, locale).title).toBe("Your account is ready to be deleted");
    }
  });

  it("uses stored template params, and keeps the stored copy when a param is missing", () => {
    const row = { type: "admin.card_destination_disabled", locale: "fa", title: "کارت‌به‌کارت خاموش شد", body: "…", metadata: { [TEMPLATE_PARAMS_METADATA_KEY]: { actor: "Sara", reason: "audit" } } };
    expect(notificationCopyFor(row, "en")).toEqual({ title: "Card-to-card switched off", body: expect.stringContaining("Sara switched the card-to-card account off") });
    expect(notificationCopyFor({ ...row, metadata: null }, "en")).toEqual({ title: row.title, body: row.body });
  });

  it("leaves unknown types alone", () => {
    expect(notificationCopyFor({ ...faRow, type: "no.such.type" }, "en").title).toBe(faRow.title);
  });
});
