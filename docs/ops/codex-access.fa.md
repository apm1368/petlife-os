# مسیر دسترسی و انتشار Codex

آخرین بررسی واقعی: ۲۰۲۶/۱۰/۱۶. این سند هیچ رمز، توکن یا کلید خصوصی ندارد. وضعیت آماده‌سازی محیط، دسترسی عملی و انتشار سه شاهد مستقل‌اند.

## GitHub

مرجع مشترک کد و هماهنگی: https://github.com/apm1368/petlife-os و [Stabilization board #4](https://github.com/apm1368/petlife-os/issues/4).

- خواندن `main` و `stabilization/wave-1` با `git ls-remote` موفق بود. fetch تازه نیز انجام شد؛ تنظیم fetch اولیه تنها شاخهٔ تاریخی را می‌آورد، بنابراین دو ref هدف صریحاً fetch شدند. از آن شاخهٔ تاریخی یا ZIP برای بازنویسی استفاده نشد.
- `gh api user` حساب `apm1368` را احراز کرد و API مخزن `permissions.push=true` گزارش داد.
- `git push --dry-run --no-verify` به نام آزمایشی یکتا موفق شد؛ شاخهٔ آزمایشی واقعاً ایجاد نشد. hook اجرا نشد. این شاهد dry-run است، نه انتشار.
- توسعه: شاخهٔ تازهٔ `codex/stab-<topic>` از آخرین `origin/stabilization/wave-1`، PR کوچک به همان شاخه. شاخه و SHA پس از push باید با `git ls-remote` یا API دوباره خوانده شوند.
- هیچ push مستقیم یا force-push به `main` یا `stabilization/wave-1` مجاز نیست. ادغام فقط با رعایت checks/review/protection واقعی GitHub؛ اختیار اجرای مالک جایگزین قاعدهٔ اجباری مخزن نمی‌شود.

## شبکه و SSH این نشست

`environment_status`: محیط متصل و running، observations_current=true؛ HTTP با mode=unrestricted ولی state=unknown. هیچ secret، runtime variable یا outbound identity متصل گزارش نشد. وضعیت unknown اثبات enforce شدن سیاست نیست.

`/etc/codex/network-policy.json`: HTTP نامحدود از `proxy:8080`؛ VPN پیکربندی نشده (`vpn_configured=false`)؛ دامنه‌ها و CIDRهای مجاز TCP خالی‌اند. اتصال واقعی به مسیر رسمی CONNECT یعنی `proxy:8088` برای `185.231.112.154:22` با `Connection refused` شکست خورد. دسترسی HTTP سایت برقرار است؛ این معادل SSH نیست.

پوشهٔ `~/.ssh` موجود نبود، SSH agent هویت قابل استفاده نداشت؛ در بررسی نام فایل‌های کلید در home، workspace، tmp و مسیر binding محیط، کلید خصوصی متناظر پیدا نشد. کلید خصوصی از کلید عمومی قابل بازیابی نیست.

- کلید عمومی ثبت‌شده روی سرور: `codex-petlife-development-20261016`
- اثر انگشت مورد انتظار کلید کاربر: `SHA256:56lkXiCgstOympfyPPYNOcLdM5LUbPd903EiKOHO54s`
- اثر انگشت معتبر میزبان: `SHA256:UyN4qdt/x1leFb6FPbKEDD8hKhaqltNJNFcxDXT889E`

هیچ ورود SSH واقعی انجام نشد. بررسی هویت میزبان غیرفعال نشده است. listener رسمی TCP مستند محیط، VPN و grant لازم دارد و فقط IPv4 خصوصی/CGNAT را می‌پذیرد؛ افزودن IP عمومی سرور به فهرست به‌تنهایی راه‌حل نیست. در صورت نیاز، اپراتور باید مسیر رسمی پشتیبانی‌شده و کلید خصوصی متناظر را امن به نشست متصل کند. برای انتشار فعلی SSH مستقیم لازم نیست.

## انتشار و تأیید

مسیر: `stabilization/wave-1 → PR → main → Deploy to VPS → CI قابل فراخوانی → deploy → smoke`.

Workflow موجود: `.github/workflows/deploy.yml`. کلید و احراز سرور از secrets موجود Actions استفاده می‌شود؛ برای اتصال Codex آن‌ها یا حساب‌ها و اتصال‌های Claude Code را تغییر ندهید. workflow و امنیت سرور بدون ضرورت عوض نشود.

`deploy.sh` از قفل deploy و `flock /var/lock/petlife-build.lock` برای کار سنگین استفاده می‌کند. پیش از migrate از پایگاه داده dump می‌گیرد و تغییرات را با rollback ساخت/health اجرا می‌کند. تغییر این سند migration ندارد. migration جدید باید جداگانه بررسی شود؛ failed migration بدون تشخیص resolve نمی‌شود. خروجی بکاپ یا Actions نباید حاوی secrets باشد.

سبز شدن CI به معنی انتشار نیست. اجرای job واقعی deploy و smoke باید موفق باشد و SHA کامل `/api/health/version` با commit انتشار مقایسه شود. GETهای سلامت و صفحات مجازند؛ عملیات مالی، upload یا mutation مخرب روی دادهٔ زنده برای smoke مجاز نیست.

آخرین شاهد پیش از این ادامه:

- `GET http://185.231.112.154/api/health/version` → SHA `249c4f1480ad7d3807ba94c52ac228f6e168d90c` و deploymentId `github-38865321253-1`؛ محیط `staging`.
- `GET http://185.231.112.154/api/health/ready` → database=up، redis=up.
- [اجرای انتشار مبنا](https://github.com/apm1368/petlife-os/actions/runs/38865321253) موفق بود. انتشار تغییر تازه باید شاهد مستقل داشته باشد.

## بررسی محلی

نصب دقیق با pnpm 10.33.0 و frozen-lockfile انجام شد. به دلیل قابل‌نوشتن نبودن مسیر پیش‌فرض home، cache/store فقط به مسیرهای workspace منتقل شدند؛ secrets یا تنظیمات اتصال تغییر نکردند. Prisma Client واقعی 5.22.0 تولید شد؛ محدودیت دانلود در گزارش قدیمی برای این نشست برقرار نبود. تست یکپارچه باید از PostGIS/Redis محلی و پایگاه دادهٔ اختصاصی test استفاده کند؛ هیچ تستی به DB سرور وصل نشود.
