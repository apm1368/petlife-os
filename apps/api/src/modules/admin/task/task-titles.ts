/** Persian titles for rule-generated admin tasks (the admin team works in fa); machine codes stay in source/description. */
export const DOC_KIND_FA: Record<string, string> = { LICENSE: "مجوز", IDENTITY: "هویت", BUSINESS_REGISTRATION: "ثبت کسب‌وکار", BANK_INFO: "اطلاعات بانکی", OTHER: "سایر" };
export const REPORT_REASON_FA: Record<string, string> = { ANIMAL_WELFARE: "رفاه حیوان", DANGEROUS_CONTENT: "محتوای خطرناک", HARASSMENT: "آزار", PERSONAL_INFORMATION: "اطلاعات شخصی", SCAM: "کلاهبرداری" };
export const RECON_CHECK_FA: Record<string, string> = {
  INTENT_TRANSACTION: "پرداخت و تراکنش", TRANSACTION_LEDGER: "تراکنش و دفتر کل", REFUND_ORIGINAL: "بازپرداخت و پرداخت اصلی", BOOKING_CAPTURE: "رزرو و مبلغ دریافتی",
  ORDER_CAPTURE: "سفارش و مبلغ دریافتی", DONATION_LEDGER: "کمک مالی و دفتر کمک‌ها", SETTLEMENT_LEDGER: "تسویه و دفتر فروشنده", LEDGER_BALANCE: "تراز دفتر کل",
};
export const RECON_OUTCOME_FA: Record<string, string> = { MISMATCH: "مغایرت", MISSING: "کمبود ثبت", DUPLICATE: "ثبت تکراری" };
