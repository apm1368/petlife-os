-- Rule-generated admin tasks were titled in English with machine codes; the admin team works in Persian.
UPDATE "admin_tasks" SET "title" = 'ارسال مدارک احراز: ' || substring("title" from 'Verification submitted: (.*)$') WHERE "dedupeKey" LIKE 'verification-submitted:%' AND "title" LIKE 'Verification submitted: %';
UPDATE "admin_tasks" SET "title" = 'مدرک احراز منقضی شد' WHERE "dedupeKey" LIKE 'verification-document-expired:%' AND "title" LIKE 'Verification document expired%';
UPDATE "admin_tasks" SET "title" = 'مدرک احراز رو به انقضاست' WHERE "dedupeKey" LIKE 'verification-document-expiring:%' AND "title" LIKE 'Verification document expiring%';
UPDATE "admin_tasks" SET "title" = 'درخواست حذف حساب برای بررسی' WHERE "dedupeKey" LIKE 'privacy-deletion-request:%' AND "title" = 'Account deletion request to review';
UPDATE "admin_tasks" SET "title" = 'گزارش با شدت بالا' WHERE "dedupeKey" LIKE 'high-severity-report:%' AND "title" LIKE 'High-severity report%';
UPDATE "admin_tasks" SET "title" =
  (CASE WHEN "title" LIKE 'Finance MISSING%' THEN 'کمبود ثبت' WHEN "title" LIKE 'Finance DUPLICATE%' THEN 'ثبت تکراری' ELSE 'مغایرت' END) || ' مالی: ' ||
  (CASE split_part("dedupeKey", ':', 2)
     WHEN 'INTENT_TRANSACTION' THEN 'پرداخت و تراکنش' WHEN 'TRANSACTION_LEDGER' THEN 'تراکنش و دفتر کل' WHEN 'REFUND_ORIGINAL' THEN 'بازپرداخت و پرداخت اصلی'
     WHEN 'BOOKING_CAPTURE' THEN 'رزرو و مبلغ دریافتی' WHEN 'ORDER_CAPTURE' THEN 'سفارش و مبلغ دریافتی' WHEN 'DONATION_LEDGER' THEN 'کمک مالی و دفتر کمک‌ها'
     WHEN 'SETTLEMENT_LEDGER' THEN 'تسویه و دفتر فروشنده' ELSE 'تراز دفتر کل' END)
WHERE "dedupeKey" LIKE 'finance-mismatch:%' AND "title" LIKE 'Finance %';
