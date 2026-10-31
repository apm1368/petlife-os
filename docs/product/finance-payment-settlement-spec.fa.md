# PET LIFE OS — قرارداد مالی، پرداخت و تسویه

> وضعیت: **قرارداد محصول مصوب برای پیاده‌سازی؛ نه تأیید اتصال بانکی/درگاه در production**  
> منبع اصلی: «مشخصات مالی، پرداخت و تسویه — نسخهٔ ۱.۱، ۳۰ اکتبر ۲۰۲۶» (PDF مالک محصول)  
> منابع مکمل: «مرجع کامل محصول، داده، انتشار و برنامه‌ریزی — ۳۰ اکتبر ۲۰۲۶»، [ممیزی پیاده‌سازی](./implementation-audit.fa.md)، [تصمیم‌های باز](./open-decisions.fa.md)  
> وضعیت کد در زمان نگارش: `origin/main`، SHA مرجع ممیزی `b8c57c0…`

---

## 1. قاعدهٔ تفسیر

این سند تصمیم محصول را به قرارداد فنی تبدیل می‌کند. وجود `PaymentIntent`، `Refund`، ledger یا UI در کد، به‌معنی تکمیل این قرارداد نیست. تا زمانی که adapter رسمی، credential، webhook verification، تطبیق و E2E واقعی نداریم:

- `SENT` پیامک، تحویل‌شدن نیست.
- `SUCCEEDED` شبیه‌ساز، پول دریافت‌شده نیست.
- credential یا environment flag به‌تنهایی integration را `LIVE` نمی‌کند.
- هر failure باید وضعیت صادقانه، مسیر retry/review و audit داشته باشد؛ موفقیت ساختگی ممنوع است.

همهٔ مبلغ‌ها در واحد دقیق integer/Decimal ذخیره می‌شوند؛ `float` برای پول ممنوع است. هر mutation مالی باید idempotency key، actor، زمان، علت، reference immutable و در صورت ثبت ledger، entry متوازن و برگشت‌پذیر داشته باشد.

## 2. تصمیم‌های مالیِ قفل‌شده

| موضوع | قرارداد محصول مصوب | اثر فنی لازم |
| --- | --- | --- |
| روش پرداخت | gateway و کارت‌به‌کارت برای فروشگاه، رزرو، اشتراک و کمک مالی با اولویت نمایشی برابر | payment method نباید به یک vertical خاص hard-code شود. |
| رسید کارت‌به‌کارت | تنها پس از upload رسید و تأیید واحد مالی، پرداخت‌شده است؛ رد رسید سفارش را لغو نمی‌کند و کاربر می‌تواند رسید تازه بدهد | state machine مستقل، immutable receipt versions و queue مالی لازم است. |
| پرداخت آنلاین ناموفق | hold اولیه ۱۵ دقیقه؛ حداکثر ۳ retry؛ پس از سومین failure، لغو و آزادسازی فوری stock/slot | reservation و payment attempt باید atomic/idempotent باشند. |
| gateway نامشخص | پرداخت دوباره درخواست نمی‌شود؛ تا ۱ ساعت reconciliation خودکار، سپس queue مالی | status `PAYMENT_UNDER_REVIEW` و SLA/event/notification لازم است. |
| رسید دستی | ابتدا hold ۳۰ دقیقه؛ پس از آن «نیازمند بررسی مجدد ادمین» بدون آزادسازی stock/slot؛ review حداکثر ۲۴ ساعت | reminder مالی هر ۱۲ ساعت، فقط برای Finance؛ نه هشدار مدیر اصلی. |
| wallet | top-up، refund، خرید، پرداخت ترکیبی و withdrawal به حساب بانکی | user wallet ledger/account و withdrawal review هنوز در schema اصلی کامل نیست. |
| پرداخت ترکیبی | wallet تا سقف مبلغ مصرف، باقی‌مانده gateway یا کارت‌به‌کارت؛ failure باقی‌مانده، debit wallet را خودکار برمی‌گرداند | hold/release wallet entry باید به payment attempt متصل باشد. |
| withdrawal | همهٔ برداشت‌ها review دستی حداکثر یک روز کاری؛ شبا باید با نام صاحب حساب PET LIFE تطبیق داده شود و نتیجه audit شود | bank-account verification provider/operation، status و evidence لازم است. |
| چندفروشنده | cart به packageهای مستقل با ارسال/رهگیری مستقل تقسیم می‌شود؛ مشتری یک‌بار پرداخت می‌کند؛ partial cancel/refund ممکن است | order/package/split allocation و refund allocation باید snapshot داشته باشد. |
| تسویه فروشنده | default هفتگی، شنبه ۰۹:۰۰ تهران، قابل تنظیم/audited؛ پس از customer confirmation یا ۵ روز از delivery | settlement period، payout evidence، retry و debt carry-forward لازم است. |
| کمیسیون | نرخ جداگانه برای shop/service/vet، snapshot هنگام تراکنش؛ shop پس از discount و بدون shipping، service/vet پس از discount | commission rule/version و ledger posting غیرقابل‌ویرایش لازم است. |
| کمک مالی | ۱٪ کمیسیون از مبلغ کمک؛ dashboard کمپین مبلغ خالص را می‌بیند؛ receipt donor خصوصی است | donation ledger/payout/refund مستقل از seller settlement است. |

## 3. state machineهای لازم

نام enum نهایی باید با schema هماهنگ شود؛ transitionهای زیر قرارداد رفتاری‌اند و هیچ status نباید با patch آزاد تغییر کند.

### 3.1 پرداخت آنلاین

```text
REQUIRES_METHOD → PENDING_GATEWAY → SUCCEEDED
                              ├→ FAILED_RETRYABLE (retry ≤ 3, hold تا 15 دقیقه)
                              ├→ FAILED_FINAL (لغو و آزادسازی)
                              └→ UNDER_REVIEW (gateway ambiguous)
UNDER_REVIEW → RECONCILED_SUCCEEDED | FINANCE_CONFIRMED_FAILED | FINANCE_UNRESOLVED_REJECTED
```

- در هر failure، wallet debit موقت release/reverse می‌شود.
- در `UNDER_REVIEW` تا نتیجه از کاربر پرداخت دوباره نخواهید؛ پس از یک ساعت case مالی ایجاد می‌شود.
- اگر احتمال debit بانکی پس از reject هست، تا ۷۲ ساعت wallet credit خودکار ندهید؛ reconciliation روزانه و جلوگیری از double refund الزامی است.

### 3.2 کارت‌به‌کارت و رسید

```text
CARD_TRANSFER_SELECTED → AWAITING_RECEIPT → RECEIPT_SUBMITTED → FINANCE_REVIEW
                                                     ├→ APPROVED / PAID
                                                     ├→ REJECTED_CAN_RESUBMIT → RECEIPT_SUBMITTED
                                                     └→ RECHECK_REQUIRED (hold منقضی ولی stock/slot محفوظ)
```

- هر receipt یک version و objectKey خصوصی دارد؛ فایل جایگزین رکورد قبلی را overwrite نمی‌کند.
- approval/rejection فقط نقش مالی مجاز، با reason، actor/time و notification in-app/SMS است.
- receipt file public URL ندارد؛ MIME/size/virus scan و signed download/audit الزامی است.

### 3.3 wallet و برداشت

```text
TOP_UP_PENDING → AVAILABLE | FAILED
AVAILABLE → HELD_FOR_PAYMENT → SPENT | RELEASED
AVAILABLE → WITHDRAWAL_REQUESTED → REVIEWING → PAID | REJECTED | NEEDS_INFORMATION
```

- balance از sum entryهای ledger/account حاصل می‌شود، نه از یک field قابل patch.
- withdrawal به bank account verified و به نتیجهٔ name-match reference می‌دهد.
- refund/chargeback بعد از payout با reversing/debt entry ثبت می‌شود، نه mutation تاریخچه.

### 3.4 تسویه فروشنده/ارائه‌دهنده

```text
ELIGIBLE → CALCULATED → APPROVED → PAYOUT_PENDING → PAID
                               ├→ RECONCILIATION_REQUIRED
                               └→ FAILED_RETRYING (سه retry دیگر، فاصلهٔ ۲ ساعت)
FAILED_RETRYING → FINANCE_ATTENTION
```

- بازپرداخت بعد از تسویه، seller/provider debt/adjustment است و به دوره‌های بعد carry می‌شود.
- statement دوره باید gross، commission، refund/adjustment، prior debt، deduction و net payable را جدا نشان دهد.

## 4. قراردادهای ویژهٔ verticalها

### فروشگاه

- هزینهٔ ارسال دستی package قبل از پرداخت نهایی نمایش و تأیید می‌شود.
- customer تا قبل از آغاز preparation می‌تواند package را لغو کند؛ بعد از آن flow پشتیبانی/return است.
- return تا ۴۸ ساعت delivery برای damage/mismatch/expired؛ عکس دلیل لازم است؛ customer refund یا replacement را انتخاب می‌کند.
- return pending تسویهٔ seller را متوقف می‌کند؛ در رد درخواست، مهلت پنج‌روزه از delivery از نو شروع نمی‌شود.
- Product catalog مرکزی price ندارد؛ تنها `SellerOffer` قیمت/موجودی/وضعیت فروش است.

### رزرو خدمات و دامپزشکی

- booking به پت ثبت‌شده متصل و ابتدا برای provider confirmation فرستاده می‌شود؛ payment پس از تأیید provider آغاز می‌شود.
- cancellation policy per-service و admin-configured است؛ provider cancellation = full refund + replacement offer/discount.
- refund card-transfer با record مالی و queue finance پیگیری می‌شود؛ نباید wallet success جعلی نشان دهد.
- provider settlement پس از customer confirmation یا حداکثر پنج روز تکمیل خدمت eligible می‌شود.
- vet late >15min و no-show rules باید به rule version و policy service وصل شوند، نه عدد hard-coded در UI.

### کمک حیوانات و پناهگاه

- کمک ابتدا در حساب/ledger PET LIFE ثبت، سپس پس از review به پناهگاه پرداخت می‌شود؛ یک کارشناس مالی برای review کافی است.
- donor می‌تواند anonymous یا با نام دلخواه باشد؛ receipt/history فقط برای donor قابل مشاهده است.
- goal reached بر اساس مبلغ خالص پس از ۱٪ commission است؛ overage کامل به همان donor wallet بازمی‌گردد.
- refund بعد از payout پناهگاه از منابع داخلی PET LIFE به wallet donor برمی‌گردد؛ از payout بعدی پناهگاه کسر نمی‌شود.
- حساب مقصد پناهگاه توسط مدیر اعلام می‌شود؛ عدم name-match رسمی مانع نیست، اما account/decision history باید ثبت شود.

### مشاورهٔ سفر و تاکسی

- initial travel consultation رایگان است؛ اگر تخصصی شد، تیم PET LIFE قیمت را ثبت می‌کند و نیاز به price reconfirmation ندارد.
- پس از payment final، assignment SLA: هر مسئول ۲ ساعت، سه تلاش، سپس escalation مدیر ارشد؛ پرونده/مدرک داخل app است و direct download ندارد.
- taxi تا اتصال map/distance واقعی فقط `UNAVAILABLE` یا demo است، نه quote واقعی.
- taxi waiting debt: اعلان فوری و +۲۴h؛ بعد ۷۲h operations؛ بعد از عدم پرداخت، PET LIFE حداکثر سه‌بار در هر فصل هزینه را تقبل می‌کند. scope «هر مسافر یا کل سامانه» و تعریف فصل هنوز باز است.
- عدم قبول راننده تا ۱۰ دقیقه → operations؛ عدم یافتن تا ۱۰ دقیقهٔ بعد → cancellation و refund wallet.

## 5. مدل‌های جدید/تکمیلی مورد نیاز

نام‌ها پیشنهادی‌اند؛ migration باید additive، nullable-first و با backfill/rehearsal باشد.

| aggregate پیشنهادی | fieldهای هسته | دلیل/side effect |
| --- | --- | --- |
| `PlatformPaymentMethod` | verticals, type, enabled, priority, config reference, activeFrom/To | method فعال را از secret جدا می‌کند؛ admin toggle بدون credential نباید activation واقعی باشد. |
| `PlatformBankCard` | masked card, owner label, enabled, currency, effective window, created/disabled audit | registry کارت مقصد؛ شماره کامل encrypted/secret-store، نه log/UI عمومی. |
| `CardTransferPayment` | payable reference, amount/currency, status, hold deadlines, submitter, review SLA | state مستقل از `PaymentIntent` و قابل استفاده برای order/booking/subscription/donation. |
| `CardTransferReceipt` | transferId, version, private objectKey, hash, MIME/size, submittedAt | replacement append-only و کنترل فایل خصوصی. |
| `CardTransferDecision` | receiptId, outcome, reason, decidedBy, decidedAt | دلیل/actor برای audit و re-submission. |
| `WalletAccount` | owner type/id, currency, status | balance مشتق‌شده از entry؛ نه field mutable. |
| `WalletEntry` | account, direction, amount, reference type/id, idempotency key, reversalOf | topup/refund/hold/spend/withdrawal را قابل تطبیق می‌کند. |
| `WithdrawalRequest` | wallet/bank account, amount, status, review/payout evidence, dueAt | SLA یک روز کاری و manual review. |
| `VerifiedBankAccount` | owner, encrypted IBAN, account-holder result, verification reference/status | شبا و نتیجهٔ name-match را جدا از payout نگه می‌دارد. |
| `FinancialReviewCase` | subject, queue, SLA, assignee, status, escalation timestamps | gateway ambiguity، receipt و payout issue را به عملیات قابل اندازه‌گیری تبدیل می‌کند. |
| `FinancialExportJob` | report type/filter/snapshot, requester, objectKey, expiresAt | CSV/XLSX خصوصی و audit؛ query بزرگ نباید inline response شود. |

مدل‌های موجود که باید integrate شوند: `PaymentIntent`، `PaymentAttempt`، `Transaction`، `Refund`، `LedgerTransaction/Entry`، `SellerSettlement/Adjustment/Ledger*` و `DonationIntent`. هیچ مدل جدید نباید این تاریخچه را با overwrite یا parallel balance ناسازگار کند.

## 6. ERP و اعلان‌های لازم

### queueهای ادمین

- payment attempts و gateway ambiguity؛ receiptهای pending/recheck/SLA breach؛ refund؛ withdrawal؛ seller/provider settlement؛ debt/adjustment؛ donation payout.
- filter حداقل: vertical، status، SLA age، amount range، actor/assignee، creation/decision dates و reference id.
- export CSV/XLSX باید job-based، private، expire شده و permission/audit‌شده باشد.

### notification matrix پایه

| رویداد | کاربر | Finance | دیگران |
| --- | --- | --- | --- |
| receipt submitted/approved/rejected | in-app + SMS مطابق preference/critical policy | queue | — |
| receipt SLA >24h | وضعیت قابل مشاهده | reminder هر ۱۲h | مدیر اصلی هشدار نمی‌گیرد. |
| gateway under review | in-app + SMS؛ «دوباره پرداخت نکنید» | case پس از ۱h | — |
| payout/withdrawal failure | in-app مناسب | queue/alert | seller/provider فقط به scope خود. |

پیامک Faraz تا زمان credential/pattern و preflight واقعی فقط `READY_FOR_CONFIGURATION` است؛ delivery receipt جعل نمی‌شود.

## 7. شکاف با کد فعلی و ترتیب اجرا

| حوزه | وضعیت فعلی قابل اثبات | فاصله تا قرارداد |
| --- | --- | --- |
| gateway/ledger/refund | foundation موجود، adapter production ناقص | real provider، webhook/reconcile، unknown-payment queue. |
| کارت‌به‌کارت | مدل/flow کامل core commerce یافت نشد | registry، receipt خصوصی/version، finance review، hold/SLA/notification. |
| wallet/withdrawal | `Wallet` عمومی در schema یافت نشد | account/entry/withdrawal/IBAN verification و combined payment. |
| settlement فروشنده | models و عملیات پایه موجود | policy زمان‌بندی/eligibility/retry/evidence/statement با قرارداد فوق تطبیق داده شود. |
| settlement ارائه‌دهنده | booking/payment پایه وجود دارد | provider settlement ledger و eligibility صریح کامل نیست. |
| donation | intent/ledger و receipt موجود | ۱٪ commission، overage/refund-after-payout و payout policy QA. |
| export ERP | بخشی از گزارش‌ها وجود دارد | filterable queue و private CSV/XLSX jobs برای همهٔ حوزه‌ها. |

ترتیب اجرای مجاز:

1. ADR مالی، currency/display rule، event→ledger posting map و state transition table.
2. migrationهای پایهٔ payment-method/card-transfer/wallet با test و بدون activation UI.
3. private upload، scanner integration contract، finance queue و RBAC/audit.
4. card-transfer و wallet را در checkout/booking/subscription/donation به‌صورت feature-gated وصل کنید.
5. merchant/bank/provider adapter، webhook verification و reconciliation واقعی؛ سپس فقط همان method را `LIVE` کنید.
6. seller/provider/donation settlement و exports؛ migration rehearsal، browser QA و production runbook.

## 8. معیار پذیرش مالی

برای هر فلو حداقل این سناریوها باید E2E شوند: success، duplicate request/webhook، retry limit، timeout/unknown، reject/resubmit receipt، expiry/SLA escalation، partial refund، reversal پس از payout، tenant/role denial، signed-media denial و export expiry. قبل از merge/deploy نیز CI، migration rehearsal و health SHA باید ثبت شوند.
