# بازگشت پس از ریبوت (INFRA-R1)

## حادثه — ۲۰۲۶-۱۰-۰۶ تا ۲۰۲۶-۱۰-۰۹
پس از ریبوت VPS، کانتینرهای Postgres/Redis/MinIO بالا نیامدند و API با وجود وضعیت `online` در PM2 روی پورت 4000 گوش نمی‌داد؛
سایت باز می‌شد ولی همه‌ی درخواست‌های API خطای 502 می‌گرفتند تا بالا آوردن دستی.

## علت ریشه‌ای
1. کانتینرها `restart=no` داشتند (compose سیاست restart نداشت) و پس از ریبوت خاموش ماندند.
2. `main.ts` با `void bootstrap()` اجرا می‌شد. وقتی `LedgerService.onModuleInit` به دیتابیس نرسید، promise رد شد؛ PM2 handler
   `unhandledRejection` خودش را نصب می‌کند و خطا را فقط لاگ کرد — پروسه زنده ماند، workerها هر چند ثانیه خطا می‌دادند
   (لاگ خطا به ~۹۸MB رسید) و `app.listen` هرگز اجرا نشد.

## اصلاح
| بخش | رفتار |
|---|---|
| `docker-compose.yml` | `restart: unless-stopped` برای postgres/redis/minio. `deploy.sh` با `docker compose up -d --no-recreate --pull never` و `docker update --restart unless-stopped` سیاست کانتینرهای در حال اجرا را بدون ساخت دوباره هم‌گام می‌کند. |
| بوت API | `waitForDatabase`: پیش از ساخت اپ، `SELECT 1` با backoff ‏1→2→4→8→10s تا `BOOT_DB_WAIT_SECONDS` (پیش‌فرض ۹۰). اگر نشد → خروج با کد ۱. هر خطای دیگر بوت هم `process.exit(1)`. |
| PM2 | تعریف در git: `ecosystem.config.js` (`autorestart`, `restart_delay` ۵s، `min_uptime` ۱۰s، `max_restarts` ۵۰، `kill_timeout` ۱۰s). `deploy.sh` اپ‌ها را از همین فایل می‌سازد و `pm2 save` می‌کند؛ `pm2-root.service` (`pm2 resurrect`) پس از ریبوت آن‌ها را برمی‌گرداند. چون هر چرخه‌ی انتظار > `min_uptime` است، بازگشت دیرهنگام دیتابیس هیچ‌وقت سقف restart را تمام نمی‌کند. |
| Redis | فقط یک خط لاگ برای هر قطعی (به‌جای لاگ هر تلاش). |

## وابستگی‌ها در بوت
| وابستگی | وضعیت | دلیل |
|---|---|---|
| PostgreSQL | `REQUIRED_AT_BOOT` | ماژول‌ها هنگام init به آن نیاز دارند (دفتر حساب، کمیسیون) و همه‌ی درخواست‌ها به آن وابسته‌اند. |
| Redis | `OPTIONAL_AT_BOOT` | ioredis خودش وصل می‌شود؛ تا برگشتن آن OTP، توکن دانلود و rate-limit خطا می‌دهند و `/health/ready` آن را `down` گزارش می‌کند. |
| MinIO | `OPTIONAL_AT_BOOT` | روی سرور `STORAGE_DRIVER=local` است و API از MinIO استفاده نمی‌کند. |

## سلامت
- `GET /health/live` → `200 {"status":"ok"}`: پروسه و listener HTTP زنده‌اند (بوت بدون listener دیگر ممکن نیست).
- `GET /health/ready` → `200 {"status":"ok","checks":{"database":"up","redis":"up"}}` یا `503 {"status":"not-ready","checks":{…}}`؛
  هر بررسی حداکثر ۲ ثانیه؛ فقط up/down بدون جزئیات میزبان یا خطا.

## راستی‌آزمایی
```bash
/var/www/petlife-os/scripts/ops/post-boot-check.sh 240   # فقط‌خواندنی؛ همه PASS → exit 0
```
سپس smoke سرور (`docs/qa/live-smoke/README.md`).

## بازیابی دستی — فقط اضطراری (وقتی post-boot-check پس از ۵ دقیقه هنوز FAIL است)
```bash
cd /var/www/petlife-os && docker compose up -d --no-recreate --pull never postgres redis minio
pm2 resurrect || pm2 start ecosystem.config.js && pm2 save
```
اگر این لازم شد، حادثه را ثبت کنید — یعنی بازگشت خودکار شکسته است.
