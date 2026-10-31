# PET LIFE OS — تصمیم‌های باز، مالک و اثر توقف

> وضعیت: **ورودی اجباری Product / Legal / Finance / Operations**
> تاریخ: ۲۰۲۶-۱۰-۳۱
> مرتبط با: [ممیزی پیاده‌سازی](./implementation-audit.fa.md) و [قرارداد مالی، پرداخت و تسویه](./finance-payment-settlement-spec.fa.md)

این فهرست چیزی را به‌جای مالک محصول تصمیم نمی‌گیرد. هر مورد شامل اثر فنی آن است تا تیم نتواند با default پنهان یا UI ساختگی از کنارش عبور کند. تصمیم‌های مالیِ نسخه‌دار از این فهرست حذف نشده‌اند؛ وضعیت آن‌ها برای جلوگیری از تصمیم‌گیری دوباره به‌روز شده است.

## A. تصمیم‌های مسدودکنندهٔ انتشار دامنه

| ID | تصمیم لازم | گزینه/ابهام دقیق | مالک پیشنهادی | اثر تا زمان تصمیم |
| --- | --- | --- | --- | --- |
| DEC-001 | policy آدرس | آیا هیچ آدرس دائمی نگیریم، یا فقط در checkout/visit/taxi و با چه retention/masking؟ | Product + Privacy/Legal | توسعهٔ جمع‌آوری/نمایش آدرس، map و delivery فراتر از مدل فعلی متوقف است. |
| DEC-002 | پرداخت کارت‌به‌کارت — **قرارداد محصول بسته** | registry کارت فعال، owner/currency/window، رسید نسخه‌دار خصوصی، SLA، rejection/resubmit و refund در [قرارداد مالی](./finance-payment-settlement-spec.fa.md) آمده است. | Finance + Security | implementation، scanner/media، RBAC و adapter/payout واقعی باقی است؛ آپلود فیش بدون domain model ممنوع است. |
| DEC-003 | کیف‌پول و combined payment — **قرارداد محصول بسته** | top-up/refund/spend/withdrawal، entryهای برگشت‌پذیر، combined payment و review در [قرارداد مالی](./finance-payment-settlement-spec.fa.md) آمده است. | Finance + Legal | currency canonical، limits/KYC و event→posting map هنوز باید به ADR/قرارداد حقوقی تبدیل و پیاده‌سازی شوند. |
| DEC-004 | multi-vendor checkout — **قرارداد محصول بسته** | package مستقل، یک پرداخت، partial cancel/refund، shipping و eligibility تسویه در [قرارداد مالی](./finance-payment-settlement-spec.fa.md) آمده است. | Commerce Product + Ops | باید با cart/order/fulfillment API، inventory reservation و E2E پیاده‌سازی شود. |
| DEC-005 | تاکسی subsidy/debt | یارانه برای چه کاربر/منطقه/فصل/سقف است؟ بدهی چه زمانی ایجاد و چگونه وصول/بخشوده می‌شود؟ | Product + Finance + Ops | قیمت‌گذاری/تخفیف تاکسی یا status بدهی نباید hard-code شود. |
| DEC-006 | provider calendar و rounding | zone زمانی، slot granularity، buffer، overbooking، no-show، گردکردن پول/زمان و waitlist؟ | Services Product + Ops | availability/rate engine کامل و SLA رزرو قابل انتشار نیست. |
| DEC-007 | emergency duty of care | محدودهٔ جغرافیایی/زمانی، partner verified، disclaimer، escalation انسانی، مسئولیت و fallback چیست؟ | Medical/Ops + Legal + Product | عنوان/CTA «اورژانس ۲۴/۷» نباید live claim شود. |
| DEC-008 | lifecycle پت | انتقال ownership، lost/deceased/memorial، دسترسی اعضا/کلینیک، export/delete و remembrance چه می‌شود؟ | Product + Legal | endpoint حذف/آرشیو و UX lifecycle نباید صرفاً بر enum schema تکیه کند. |
| DEC-009 | retention/delete/export | دورهٔ نگهداری مالی/پزشکی/audit، anonymization، waiting period، cancellation و legal hold؟ | Legal + Security + Product | account deletion execution عمداً قفل می‌ماند. |
| DEC-010 | provider/partner verification | معیار تأیید، مدارک، expiry، suspension، public badge و re-review؟ | Operations + Legal | partner واقعی نباید از دادهٔ seed/placeholder live شود. |

## B. تصمیم‌های مالی و حسابداری

| ID | تصمیم لازم | اثر فنی |
| --- | --- | --- |
| FIN-001 | واحد پول canonical (IRR/تومان display)، rounding و conversion | amountها integer هستند؛ UI فقط باید تبدیل نمایشی کند و rounding rule مشترک داشته باشد. |
| FIN-002 | chart of accounts و event→posting map | هر `Payment/Refund/Donation/Payout/Commission/Wallet movement` باید debit/credit مشخص، متوازن و reversible داشته باشد. |
| FIN-003 | کمیسیون ۱٪ حمایت/NGO | مبنا (gross/net)، tax/fee، زمان شناسایی، refund/chargeback و payout NGO. |
| FIN-004 | travel manual quote | قیمت اولیهٔ رایگان/نمایشی، authority تغییر قیمت، تایید کاربر، deadline و assignment SLA. |
| FIN-005 | settlement seller/provider | چرخه، cutoff، hold/reserve، dispute، bank account verification، paid evidence و reconciliation. |
| FIN-006 | invoice/receipt | تفاوت order receipt، tax invoice، gateway receipt، card-transfer receipt و donation receipt؛ retention و access هرکدام. |
| FIN-007 | production payment provider | merchant قرارداد، API spec، callback/webhook signature، dispute/refund، SLA و environment keys. |

## C. تصمیم‌های هویت، امنیت و حریم خصوصی

| ID | تصمیم لازم | اثر فنی |
| --- | --- | --- |
| SEC-001 | OTP Faraz | line، API key، approved OTP/notification patterns، opt-in و messaging rate limit. |
| SEC-002 | Google OAuth | OAuth consent screen، redirect domains، allowed account linking و recovery conflict policy. |
| SEC-003 | فایل خصوصی | mime/size/virus scan، encryption، S3 bucket region، retention، download audit و incident response. |
| SEC-004 | admin impersonation/password assistance | آیا مجاز است؟ اگر بله، dual-control، reason، session banner، notification و non-repudiation لازم است. |
| SEC-005 | role matrix | role × resource × action × vertical؛ read-only/reporting و export permissions باید صریح باشند. |
| SEC-006 | real personal data policy | چه seed/demo داده‌ای فقط development است، چه محیطی PII دارد و access log چگونه نگهداری می‌شود؟ |

## D. تصمیم‌های تجربه، طراحی و محتوا

| ID | تصمیم لازم | اثر فنی |
| --- | --- | --- |
| UX-001 | Landing | landing و logo قفل هستند؛ hero فقط asset تأییدشدهٔ مالک در هر دو زبان استفاده می‌کند، بدون تغییر composition. |
| UX-002 | language/RTL | متن signage در تصویر انگلیسی فقط در variant انگلیسی همان composition مجاز است؛ data/number/date با logical direction پیاده می‌شوند. |
| UX-003 | button system | hierarchy معلوم است اما styling نهایی فقط با direction تأییدشده تثبیت می‌شود. |
| UX-004 | active pet/personalization | در routeهایی که backend active pet/context ندارد، UI باید empty/incomplete truthful باشد؛ persona یا health data ساختگی ممنوع. |
| UX-005 | review/media moderation | verified purchase/provider review، report، consent، before/after media، retention و appeal. |
| UX-006 | video subscription | content owner/licence، streaming provider، offline/download policy، rating/age and moderation. |

## E. داده‌ها و اتصال‌های خارجی

| ID | تصمیم/ورودی لازم | اثر فنی |
| --- | --- | --- |
| EXT-001 | map/distance provider و قرارداد | taxi/ETA/nearby/route فقط پس از rate limit، cache، consent و failure behavior واقعی. |
| EXT-002 | shipping provider | quote/label/track/cancel/webhook و address data-sharing agreement. |
| EXT-003 | accommodation/travel partners | availability/rate/pet policy/cancellation source، manual fallback owner و SLA. |
| EXT-004 | insurer partners | quote/bind/claim API و data-processing agreement؛ claim-prep را با insurance purchase اشتباه نگیرید. |
| EXT-005 | clinic/vet directory | license verification، hours، emergency capacity، address visibility و stale data review. |
| EXT-006 | marketplace channels | Torob/Digikala seller credentials، legal catalogue mapping، order ingestion/reconciliation. |

## F. فرم تصمیم پیشنهادی برای هر مورد

برای بستن هر مورد بالا، Product Manager باید این پنج سطر را تکمیل کند:

```text
Decision ID:
Chosen rule (including examples and exceptions):
Owner / approver / effective date:
Customer-visible copy and failure behavior:
Acceptance criteria + metrics + required integration credentials:
```

پس از ثبت، تیم فنی باید آن را به ADR یا product policy versioned تبدیل کند، API contract و migration impact را بازبینی کند، تست‌های denied/failure را اضافه کند و تنها بعد از CI/production preflight آن feature flag را فعال نماید.
