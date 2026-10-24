# آمادگی زیرساخت و یکپارچه‌سازی‌های خارجی (۱۴۰۵/۰۷/۱۴)

## Node 22
| مورد | وضعیت فعلی | آمادگی |
|---|---|---|
| runtime سرور | Node v20.20.2 (pm2) | — |
| CI | `actions/setup-node` با `node-version: 20` | تغییر یک‌خطی |
| `engines` | `>=20` | سازگار |
| `@types/node` | ^22 | سازگار |
| ماژول native | فقط `argon2@0.45.1` (N-API؛ سازگار با ۲۲، روی سرور دوباره build می‌شود) | سازگار |
| Next 14.2.18 / NestJS 10.4 / Prisma 5.22 | همه Node 22 را پشتیبانی می‌کنند | سازگار |
| هشدار AWS SDK v3 | نسخه‌های منتشرشده پس از ژانویهٔ ۲۰۲۷ به Node ≥22 نیاز دارند | مهلت |

**تصمیم:** فعلاً ارتقا داده نشد.

**برنامهٔ امن:**
1. یک job موازی Node 22 به CI اضافه شود و lint، typecheck، unit، e2e و build با آن سبز شوند.
2. بعد Node 22 روی سرور نصب شود، در کنار ۲۰.
3. پس از گرفتن نسخهٔ پشتیبان، `pnpm install --frozen-lockfile` اجرا شود (برای rebuild ماژول argon2)، سپس `pm2 restart` و چک سلامت.
4. **بازگشت در صورت مشکل:** برگشت به مسیر Node 20 در pm2.

**مهلت:** پیش از ژانویهٔ ۲۰۲۷.

## یکپارچه‌سازی‌های خارجی (سرور اصلی)
| مورد | وضعیت | شاهد |
|---|---|---|
| نقشه / مسافت | **NOT_CONFIGURED** (ارائه‌دهندهٔ نقشه `BLOCKED_EXTERNAL`) | `TRANSPORT_DISTANCE_MODE` تنظیم نشده، پس `UNAVAILABLE`. فقط حالت `straight_line_demo` برای QA وجود دارد |
| پیامک فراز | **READY_FOR_CONFIGURATION** | Pattern API واقعی پیاده شده؛ deploy فقط با وجود کلید، خط و UID پترن تأییدشده روی سرور آن را فعال می‌کند. `SENT` فقط پذیرش/صف را نشان می‌دهد |
| ورود با کد یک‌بارمصرف (OTP) | **READY_FOR_CONFIGURATION** | provider واقعی Faraz پیاده شده و بدون کلید، خط و UID پترن در startup fail-closed است؛ وضعیت LIVE پس از deploy و preflight سرور ثبت می‌شود |
| درگاه پرداخت | **SANDBOX** | `PAYMENT_SANDBOX_MODE=sandbox`؛ merchant id و کلید تنظیم نشده‌اند |
| ذخیره‌سازی S3 / private | **NOT_CONFIGURED** | `STORAGE_DRIVER=local`؛ فایل‌ها روی دیسک سرور ذخیره می‌شوند و URLها امضاشده‌اند |
| TLS | **READY_TO_DEPLOY** | تنظیم transactional Nginx/Let's Encrypt برای `opetlife.ir` و smoke test مستقیم HTML/API/JavaScript در release موجود است؛ نتیجهٔ LIVE پس از deploy ثبت می‌شود |
| `NODE_ENV` سرور | `development` | سرور اصلی، سرور آزمایشی کانونی است. پیش از ورود کاربر واقعی باید `production` شود، همراه با OTP واقعی و TLS |
