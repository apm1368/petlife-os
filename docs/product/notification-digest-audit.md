# ممیزی خلاصه‌ی روزانه‌ی اعلان‌ها (Daily Digest)

نتیجه: **BLOCKED_EXTERNAL** — زیرساخت داخلی جدیدی ساخته نشد، چون بدون کانال بیرونی ارزش واقعی ندارد.

## آنچه هست

| بخش | وضعیت |
|---|---|
| گروه‌بندی | `notification-groups.ts`: ۱۱ گروه مشتق از category/type (HEALTH, CARE, BOOKING, ORDER, TRAVEL, COMMUNITY, SUPPORT, CLINIC, SUBSCRIPTION, SECURITY, OTHER). |
| مدل ترجیح | `NotificationDigestPreference(userId, group, mode)` با `INSTANT` / `DAILY` / `OFF`؛ API `GET/PUT /notification-preferences/digest` با `deliveryStatus: "STORED_ONLY"`. |
| کانال‌ها | `IN_APP` کار می‌کند. `SMS` فقط sandbox (آداپتور dev؛ Faraz کلید ندارد). `EMAIL` و `PUSH` هیچ پیاده‌سازی ندارند. |
| زمان‌بندی worker | الگوی `setInterval` موجود (delivery worker، trial/trip notifier) قابل استفاده است. |
| زبان | `user.locale` و قالب‌های fa/en در `notification-templates.ts`. |
| جلوگیری از تکرار | یکتایی `(domainEventId, type, userId)` و رویداد قطعی با UUID مشتق از hash. |

## چرا چیزی ساخته نشد

- خلاصه‌ی روزانه فقط وقتی معنا دارد که به کانالی برود که کاربر را صدا بزند (ایمیل، پیامک، push). هیچ‌کدام امروز واقعی نیست.
- خلاصه‌ی درون‌برنامه‌ای همان اعلان‌هایی را تکرار می‌کند که بلافاصله در صندوق هستند؛ و اگر حالت `DAILY` اعلان درون‌برنامه‌ای فوری را
  نگه دارد، تنها کانال کارآمد امروز را کند می‌کند. هر دو تغییر رفتار بدون سود است.
- ساختن `DigestCompilation` بدون ارسال، ردیف‌هایی می‌سازد که هیچ مصرف‌کننده‌ای ندارند؛ و علامت‌گذاری «ارسال‌شده» ممنوع است.

## قرارداد آماده برای وقتی کانال وصل شد

1. worker روزانه (ساعت محلی کاربر، بیرون از quiet hours) برای هر `(userId, group)` با `mode=DAILY` اعلان‌های خوانده‌نشده‌ی ۲۴ ساعت اخیر را جمع می‌کند.
2. یک `NotificationDelivery` با کانال واقعی و کلید یکتای `digest:{userId}:{group}:{yyyy-mm-dd}` (جلوگیری از تکرار) و قالب `digest.daily` (fa/en، بدون جزئیات پزشکی در SMS).
3. `mode=OFF` ارسال بیرونی آن گروه را قطع می‌کند؛ اعلان‌های امنیتی (SECURITY) غیرقابل‌قطع می‌مانند.
4. `deliveryStatus` از `STORED_ONLY` به وضعیت واقعی کانال تغییر می‌کند.

برای Codex: تا آن زمان صفحه‌ی تنظیمات باید متن «ذخیره می‌شود؛ ارسال خلاصه هنوز فعال نیست» را از روی `deliveryStatus` نشان دهد.
