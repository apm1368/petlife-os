/** Persian titles for rule-generated admin tasks (the admin team works in fa); machine codes stay in source/description. */
export const DOC_KIND_FA: Record<string, string> = { NATIONAL_ID_CARD: "کارت ملی", BUSINESS_LICENSE: "مجوز کسب‌وکار", ENAMAD: "اینماد", LICENSE: "مجوز", IDENTITY: "هویت", BUSINESS_REGISTRATION: "ثبت کسب‌وکار", BANK_INFO: "اطلاعات بانکی", OTHER: "سایر" };
export const REPORT_REASON_FA: Record<string, string> = { ANIMAL_WELFARE: "رفاه حیوان", DANGEROUS_CONTENT: "محتوای خطرناک", HARASSMENT: "آزار", PERSONAL_INFORMATION: "اطلاعات شخصی", SCAM: "کلاهبرداری" };
export const RECON_CHECK_FA: Record<string, string> = {
  INTENT_TRANSACTION: "پرداخت و تراکنش", TRANSACTION_LEDGER: "تراکنش و دفتر کل", REFUND_ORIGINAL: "بازپرداخت و پرداخت اصلی", BOOKING_CAPTURE: "رزرو و مبلغ دریافتی",
  ORDER_CAPTURE: "سفارش و مبلغ دریافتی", DONATION_LEDGER: "کمک مالی و دفتر کمک‌ها", SETTLEMENT_LEDGER: "تسویه و دفتر فروشنده", LEDGER_BALANCE: "تراز دفتر کل",
};
export const RECON_OUTCOME_FA: Record<string, string> = { MISMATCH: "مغایرت", MISSING: "کمبود ثبت", DUPLICATE: "ثبت تکراری" };

/** The phrases reconciliation findings record (finance-reconciliation.service.ts), in Persian for the task text. */
const RECON_TEXT_FA: Record<string, string> = {
  "one succeeded CHARGE transaction": "یک تراکنش برداشت موفق",
  "Payment captured ledger posting": "ثبت دفتر کل برای پرداخت دریافت‌شده",
  "Refund succeeded ledger posting": "ثبت دفتر کل برای بازپرداخت موفق",
  "SETTLEMENT_PAYMENT seller ledger posting": "ثبت پرداخت تسویه در دفتر فروشنده",
  "captured payment for confirmed orders": "پرداخت دریافت‌شده برای سفارش‌های تأییدشده",
  "captured payment intent for a PAID booking": "پرداخت دریافت‌شده برای رزرو پرداخت‌شده",
  "donation ledger posting": "ثبت در دفتر کمک‌های مالی",
  "donation refund ledger posting": "ثبت بازپرداخت کمک مالی در دفتر",
  "donation transaction": "تراکنش کمک مالی",
  "original payment intent": "پرداخت اصلی",
  "financing refund": "بازپرداخت اقساطی",
  "items gross differs from settlement gross": "جمع اقلام با جمع تسویه برابر نیست",
  "original intent not captured": "پرداخت اصلی دریافت نشده است",
  "payment posted for a non-positive settlement": "برای تسویهٔ صفر یا منفی پرداخت ثبت شده است",
  "refunds exceed captured amount": "مجموع بازپرداخت‌ها از مبلغ دریافتی بیشتر است",
  "succeeded charge on a non-captured intent": "برداشت موفق روی پرداختی که دریافت نشده",
};
const RECON_KEY_FA: Record<string, string> = {
  expected: "مورد انتظار", reason: "علت", note: "یادداشت", postings: "تعداد ثبت‌ها", succeededCharges: "تعداد برداشت‌های موفق",
  capturedIntents: "تعداد پرداخت‌های دریافت‌شده", chargeAmount: "مبلغ برداشت (ریال)", ledgerAmount: "مبلغ دفتر کل (ریال)",
  capturedAmount: "مبلغ دریافتی (ریال)", checkoutTotal: "مبلغ سبد (ریال)", expectedAmount: "مبلغ مورد انتظار (ریال)",
  transactionAmount: "مبلغ تراکنش (ریال)", refundedTotal: "مجموع بازپرداخت (ریال)", captured: "مبلغ دریافتی (ریال)",
  itemsGross: "جمع اقلام (ریال)", grossIrr: "جمع تسویه (ریال)", intentStatus: "وضعیت پرداخت", ledger: "دفتر", debitMinusCredit: "بدهکار منهای بستانکار (ریال)",
};

/**
 * A reconciliation finding's detail as one readable Persian line for the task description (it used to be raw JSON,
 * so staff saw English like "Payment captured ledger posting"). Unknown keys or values pass through unchanged.
 */
export function reconDetailFa(detail: Record<string, unknown>): string {
  const fa = new Intl.NumberFormat("fa-IR");
  const value = (v: unknown): string => {
    if (typeof v === "number") return fa.format(v);
    if (typeof v !== "string") return JSON.stringify(v);
    if (RECON_TEXT_FA[v]) return RECON_TEXT_FA[v]!;
    const settlement = /^settlement (\w+)$/.exec(v);
    return settlement ? `وضعیت تسویه: ${settlement[1]}` : v;
  };
  const parts = Object.entries(detail).map(([k, v]) => `${RECON_KEY_FA[k] ?? k}: ${value(v)}`);
  return parts.length ? parts.join("؛ ") : "جزئیاتی ثبت نشده است.";
}

