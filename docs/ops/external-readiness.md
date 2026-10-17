# وضعیت آمادگی اتصال‌های خارجی (سرور اصلی http://185.231.112.154/)

به‌روزرسانی: 2026-10-05 — بر پایه‌ی کد `integration/local` و پیکربندی واقعی سرور (فقط نام کلیدها و پرچم‌های غیرمحرمانه خوانده شد؛
هیچ مقدار محرمانه‌ای ثبت نشده). وضعیت‌های مجاز: `LIVE`, `SANDBOX`, `NOT_CONFIGURED`, `NOT_IMPLEMENTED`, `BLOCKED_EXTERNAL`, `ERROR`.
هیچ موفقیتی جعل نمی‌شود: کاربر در هر حالت غیر از `LIVE` پیام صادقانه می‌بیند.

| اتصال | وضعیت | شاهد | برای رسیدن به LIVE لازم است |
|---|---|---|---|
| MAPS | `NOT_IMPLEMENTED` | هیچ آداپتور نقشه یا مسیریابی در کد نیست. فاصله‌ی تاکسی `TRANSPORT_DISTANCE_MODE=unavailable` (پیش‌فرض) و قیمت `DISTANCE_UNAVAILABLE` / `NOT_CONFIGURED`؛ مکان‌ها فقط مختصات ذخیره می‌کنند. | انتخاب ارائه‌دهنده (مثلاً نشان) + کلید + آداپتور |
| FARAZ SMS | `NOT_CONFIGURED` | آداپتور `faraz-sms.adapter.ts` پیاده شده ولی کلید و آدرس API روی سرور نیست؛ `MESSAGING_SANDBOX_MODE=sandbox` و پیامک‌ها از آداپتور dev شبیه‌سازی می‌شوند (کانال SMS = `SANDBOX`). | کلید Faraz، خط ارسال، `MESSAGING_SANDBOX_MODE=production` (اعتبارسنجی env بدون کلید اجازه نمی‌دهد) |
| OTP ورود | `SANDBOX` | `OTP_PROVIDER=dev`: کد فقط در لاگ سرور است و به کاربر ارسال نمی‌شود (در پاسخ API هم نیست). ورود با OTP برای کاربر واقعی ممکن نیست. | وابسته به FARAZ SMS |
| EMAIL | `NOT_IMPLEMENTED` | کانال `EMAIL` فقط در enum هست؛ هیچ آداپتور یا SMTP در کد نیست. | ارائه‌دهنده‌ی ایمیل + آداپتور + قالب‌ها |
| PAYMENT | `SANDBOX` | `PAYMENT_SANDBOX_MODE=sandbox`؛ درگاه `dev_simulated` شارژ را شبیه‌سازی می‌کند؛ درگاه استاندارد/Digipay/SnappPay کلید ندارند. از نسخه‌ی `8f712ec` وبهوک‌های بدون امضای sandbox روی سرور بسته‌اند (`DEV_SIMULATION_ENABLED` تنظیم نشده). | قرارداد درگاه + کلید + `PAYMENT_SANDBOX_MODE=production` |
| SETTLEMENT | `NOT_IMPLEMENTED` | تسویه با کلینیک/فروشنده/ارائه‌دهنده ساخته نشده؛ PRODUCT_DECISION_REQUIRED (کمیسیون، دوره، بازپرداخت پس از تسویه، پیش‌پرداخت، تأیید حساب بانکی، مالیات). | تصمیم محصول و سپس پیاده‌سازی |
| S3 | `NOT_CONFIGURED` | درایور S3 پیاده شده (`s3-storage.driver.ts`) ولی `STORAGE_DRIVER=local`؛ فایل‌ها روی دیسک سرور هستند (پشتیبان‌گیری جداگانه لازم). | سرویس ذخیره‌سازی، کلید، `STORAGE_DRIVER=s3` و انتقال فایل‌های موجود |
| INSURANCE PARTNER | `BLOCKED_EXTERNAL` | فقط پوشه‌ی آماده‌سازی ادعا وجود دارد و API صادقانه `submission: "NOT_AVAILABLE"` برمی‌گرداند؛ هیچ API شریکی در دست نیست. | قرارداد و API شریک بیمه |
| TLS | `NOT_CONFIGURED` | `https://185.231.112.154/` اتصال نمی‌گیرد؛ nginx فقط HTTP سرو می‌کند و HSTS ندارد. کوکی‌ها و OTP روی HTTP منتقل می‌شوند. | دامنه + گواهی (مثلاً Let's Encrypt) + ریدایرکت و HSTS؛ nginx با CI مستقر نمی‌شود (`docs/ops/nginx-petlife-os.conf`) |
| SHIPPING (Alopeyk/Snappbox) | `SANDBOX` | `SHIPPING_MODE=sandbox`؛ کلید ندارند. | قرارداد + کلید |
| GOOGLE SIGN-IN | `NOT_CONFIGURED` | `GOOGLE_AUTH_ENABLED=false`. | OAuth client + callback روی دامنه‌ی HTTPS |

## نکته‌ی محیط

- سرور با `NODE_ENV=development` اجرا می‌شود. سطح‌های شبیه‌سازی از `8f712ec` فقط با `DEV_SIMULATION_ENABLED=true` باز می‌شوند و این پرچم روی سرور **نباید** تنظیم شود.
- رفتن به `NODE_ENV=production` به S3، OTP واقعی و درگاه/پیامک واقعی وابسته است (اعتبارسنجی env بدون آن‌ها بالا نمی‌آید)؛ بنابراین فعلاً BLOCKED_EXTERNAL است.

## آمادگی Node 22

- امروز: سرور و CI روی Node 20 (`v20.20.2`)، `engines.node >=20`.
- هشدار AWS SDK: نسخه‌های منتشرشده پس از هفته‌ی اول ژانویه‌ی ۲۰۲۷ Node 22 می‌خواهند؛ تا آن زمان قفل نسخه‌ی فعلی SDK کافی است.
- مسیر پیشنهادی (زمان‌بندی‌نشده): ۱) یک job موازی CI با `node-version: 22` (بدون deploy)، ۲) سبزشدن lint/typecheck/unit/e2e/web، ۳) ارتقای Node سرور در پنجره‌ی زمان‌بندی‌شده با پشتیبان. ارتقای production فقط با تأیید صریح.
