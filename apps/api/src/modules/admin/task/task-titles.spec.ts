import { reconDetailFa } from "./task-titles";

describe("reconDetailFa", () => {
  it("turns a reconciliation finding into one Persian line, numbers included", () => {
    expect(reconDetailFa({ expected: "Payment captured ledger posting" })).toBe("مورد انتظار: ثبت دفتر کل برای پرداخت دریافت‌شده");
    expect(reconDetailFa({ reason: "refunds exceed captured amount", refundedTotal: 1200, captured: 1000 })).toBe("علت: مجموع بازپرداخت‌ها از مبلغ دریافتی بیشتر است؛ مجموع بازپرداخت (ریال): ۱٬۲۰۰؛ مبلغ دریافتی (ریال): ۱٬۰۰۰");
    expect(reconDetailFa({ reason: "settlement FAILED" })).toBe("علت: وضعیت تسویه: FAILED");
    expect(reconDetailFa({})).toBe("جزئیاتی ثبت نشده است.");
  });
  it("leaves unknown keys and values as they are", () => {
    expect(reconDetailFa({ somethingNew: "abc" })).toBe("somethingNew: abc");
  });
});
