# مسیر دسترسی و انتشار Codex

آخرین به‌روزرسانی با تأیید زنده: 2026/10/17 03:30 UTC. این سند هیچ رمز، توکن یا کلید خصوصی ندارد. آماده‌سازی محیط، دسترسی عملی و انتشار شواهد مستقل‌اند.

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


## شاهد انتشار جدید opetlife — #33

- main قبلی `249c4f1480ad7d3807ba94c52ac228f6e168d90c`؛ کد تثبیت `98b61188fa86b77cbfbcc300356a3a0280f7cc3d`؛ commit انتشار و SHA گزارش‌شدهٔ API اجراشده `60f15ef52e5e3e3b9a6bc8ba6a99f30154d76671`.
- [اجرای واقعی انتشار](https://github.com/apm1368/petlife-os/actions/runs/38966361292) کامل و موفق؛ deploymentId برابر `github-38966361292-1`. CI و موفقیت job deploy مستقل خوانده شدند؛ سپس health/version و ready به‌صورت GET تازه از سایت خوانده شدند. PostgreSQL/Redis up، وب fa/en پاسخ‌گو و دارایی‌های جدید اصلی با hash صحیح بودند.
- [وب فعال](http://185.231.112.154/fa)، [افزودن پت](http://185.231.112.154/fa/pets/new)، [مدارک ادمین](http://185.231.112.154/fa/admin/verification). بررسی مسیر خصوصی بدون نشست فقط smoke پوسته/احراز هویت است؛ تست مالی یا mutation زنده اجرا نشد.
- خواندن و نوشتن GitHub با SHA شاخه‌های واقعاً push‌شده و ادغام عادی PRهای #34–#37 و #33 تأیید شد. هیچ direct/force push به main یا تثبیت، تغییر کلید/حساب یا دسترسی Claude انجام نشد.
- SSH مستقیم این نشست برقرار اعلام نمی‌شود؛ اجرای SSH موفق، متعلق به runner و secrets موجود workflow است. برای اتصال Codex، workflow یا امنیت سرور تغییر نکرد. HTTPS این IP نیز در نشست تأیید نشده است؛ موفقیت HTTP معادل SSH یا سرویس‌های بیرونی نیست.

تنظیم fetch موجودِ اتصال قبلی تغییر داده نشد؛ برای به‌روزرسانی واقعی دو ref هدف از refspec صریح استفاده کنید:

```bash
git fetch origin refs/heads/main:refs/remotes/origin/main refs/heads/stabilization/wave-1:refs/remotes/origin/stabilization/wave-1
git ls-remote origin refs/heads/main refs/heads/stabilization/wave-1
```

در این اجرا، `gh pr edit` روی PR متصل به Projects Classic خطای GraphQL داشت؛ عنوان/شرح با PATCH عادی REST همان PR به‌روز شد، بدون تغییر مجوز یا دورزدن بررسی. خطای موقت API 503 نیز خطای مانیتور بود و با نتیجهٔ واقعی CI اشتباه نشد. مرجع قابلیت‌های باز و تفکیک ادغام/CI/QA/انتشار: [stabilization-remaining.fa.md](stabilization-remaining.fa.md) و [Issue #4](https://github.com/apm1368/petlife-os/issues/4).


## انتشار تکمیلی ثبت پت — #39

این شاهد از انتشار #33 جدیدتر است. [اصلاح #38](https://github.com/apm1368/petlife-os/pull/38) با head `65f715c1825af327c026726134a8dcec910f8d65` و [CI کامل همان head](https://github.com/apm1368/petlife-os/actions/runs/38971160415) در تثبیت ادغام شد. بازگشت سرد به اطلاعات اولیهٔ ذخیره‌نشده برمی‌گردد؛ نام فارسی در هدر معتبر رمزگذاری می‌شود؛ شناسهٔ پت در تراکنش ساخت برای بازیابی پس از قطع ذخیرهٔ مرحله ثبت می‌شود.

۱۱ تست وب، ۸ تست واقعی API ایزوله، typecheck و lint (سه هشدار قبلی) گذشتند. دو تصویر واقعی قبل و هشت تصویر بعد، فارسی/انگلیسی در ۳۹۰/۱۴۴۰، بدون overflow یا pageerror؛ هر جریان کنترل‌شده دقیقاً یک POST و رسیدن به مرحلهٔ عکس داشت. [جزئیات و تصاویر](../../apps/web/design-review/approved-rollout/ONBOARDING-RESUME-VALIDATION.md). این تست‌ها تضمین عمومی عدم تکرار همزمان همهٔ عملیات نیستند.

کد تثبیت `218ddea14af50a04179840510bb3c7c01420ac9d`؛ [PR انتشار #39](https://github.com/apm1368/petlife-os/pull/39)؛ [CI دقیق PR](https://github.com/apm1368/petlife-os/actions/runs/38997352436) و [CI push](https://github.com/apm1368/petlife-os/actions/runs/38997338013) کامل و موفق. commit main و SHA واقعاً گزارش‌شدهٔ API `5c1fc12f6be05fbd638f89007d9623cf5e333e26`، deploymentId `github-38997939392-1`؛ [اجرای انتشار واقعی](https://github.com/apm1368/petlife-os/actions/runs/38997939392) موفق. PostgreSQL و Redis up و ۴۰ درخواست فقط‌خواندنی سلامت/وب/API/دارایی گذشتند؛ بررسی اضافهٔ JavaScript زنده تأیید نشد: مسیر /_next/static در پراکسی نشست HEAD=302 به آدرس داخلی و GET=503 از envoy می‌دهد؛ هیچ دورزدن شبکه انجام نشد. متای SHA وب dev است و شاهد SHA کامل وب نیست. تأیید بارگذاری دارایی‌ها از مرورگر مستقل QA باز می‌ماند؛ هیچ عملیات زندهٔ نوشتنی انجام نشد. HTML خصوصی ۲۰۰، QA احرازشدهٔ آن جریان محسوب نمی‌شود.

Diff واقعی نسبت به انتشار قبلی فقط ۲۳ فایل اصلاح ثبت پت و شواهد آن است؛ migration/schema، workflow، lockfile و قابلیت محلی پیام کارت پت تغییر نکرده‌اند. هرگونه تغییر نهایی این دو سند، صرفاً گزارش در تثبیت است و SHA کد اجراشدهٔ بالا را تغییر نمی‌دهد. دسترسی و اتصال‌های Claude و ۳۰ فایل کار محلی حفظ شده‌اند. گروه‌های باز و محدودیت سرویس‌های بیرونی همچنان بازند.


## شاهد مرورگر واقعی در QA پس از #39

Chromium این نشست با پراکسی رسمی در ۱۶ بازدید fa/en و 390/1440 بررسی شد: CSS بارگذاری شد ولی JS از /_next/static پاسخ‌های 302/503 و hydration صفر داشت. HEAD بدون دنبال‌کردن redirect، envoy و مقصد خصوصی پراکسی را ثبت کرد؛ هیچ اتصال مستقیم یا دورزدن آن مقصد انجام نشد. این شاهد خرابی قطعی سایت نیست و تأیید مستقلِ مرورگر بیرون از این پراکسی لازم است. متای وب dev همچنان SHA وب محسوب نمی‌شود. نسخهٔ API زنده 5c1fc12 و PostgreSQL/Redis up بودند؛ انتشار همان run 38997939392 است. جزئیات و محدودیت‌ها در [مرجع موجود صف تثبیت](stabilization-remaining.fa.md) و PR #41 آمده‌اند. اصلاحات QA در این مرحله روی main/سایت منتشر نمی‌شوند و کلید/حساب/اتصال‌های Claude تغییر نمی‌کنند.

## انتشارهای #48 و #50 — شاهد واقعی ۱۸ اکتبر

این شاهد از checkpointهای قبلیِ «هنوز منتشرنشده» جدیدتر است. طبق درخواست مالک، بسته‌های آماده بدون انتظار برای پایان کل پروژه از مسیر موجود منتشر شدند:

- #48: تثبیت `319650b5ddc8ddde2f0581823a630356930aee2b`؛ [CI دقیق PR](https://github.com/apm1368/petlife-os/actions/runs/39137394272)؛ main و SHA واقعی API=`7c63f11bb572825d7771692f4e46d49e4b7b479d`؛ [deploy موفق](https://github.com/apm1368/petlife-os/actions/runs/39138029992)، deploymentId=`github-39138029992-1`.
- #49 اصلاح نمای پت در تثبیت `e2a811412e51bc9cda725d5810aa206956fa3e41` ادغام شد؛ head=`cb9c4abd8e867dac844d6882d09831e3ee377405` و [CI کامل](https://github.com/apm1368/petlife-os/actions/runs/39138363126) موفق. [انتشار #50](https://github.com/apm1368/petlife-os/pull/50)، [CI PR](https://github.com/apm1368/petlife-os/actions/runs/39139191453) و [CI push همان head](https://github.com/apm1368/petlife-os/actions/runs/39139157711) کامل و موفق؛ main و SHA واقعی API=`3ba6fdfed343b4c9cb1413a2911f55490c7d01d9`، [deploy موفق](https://github.com/apm1368/petlife-os/actions/runs/39140816890)، deploymentId=`github-39140816890-1`.

نتیجهٔ واقعی deploy از CI مستقل خوانده و سپس health/version و ready تازه از سایت دریافت شدند؛ PostgreSQL و Redis up. در هر نسخه ۲۰ GET وب/API پاسخ مورد انتظار داشتند؛ ۲۲ GET دارایی جدا ثبت شد. پاسخ 401 API خصوصی بدون نشست درست است و HTML خصوصی 200 فقط پوسته محسوب می‌شود. هیچ پت، پیام، پرداخت، تنظیم یا دادهٔ آزمایشی زنده ایجاد نشد.

کد انتشار schema/migration جدید، تغییر workflow/lockfile یا کار محلی پیام کارت پت ندارد. workflow موجود از flock و بکاپ پیش از migrate استفاده کرد؛ در #48 نشانگر بکاپ، نبود migration معوق و smoke موفق ثبت شد. هیچ migration failed resolve نشد. SSH مستقیم این نشست برقرار اعلام نمی‌شود؛ اتصال runner موجود را با دسترسی مستقیم Codex یکی نگیرید. کلیدها، حساب‌ها و اتصال‌های Claude تغییر نکرده‌اند.

مرورگر محلی از پراکسی رسمی برای JS هنوز 302/503/timeout و hydration صفر دارد؛ متای dev شاهد SHA وب نیست. بررسی مستقل عمومی در [PR #52](https://github.com/apm1368/petlife-os/pull/52) افزوده شده است: فقط GET/HEAD/OPTIONS به مقصد عمومی، بدون SSH یا secrets برنامه، بدون تغییر workflow انتشار/CI موجود و با حفظ مسیر شبکهٔ همان محیط. اجرای اول [39142311828](https://github.com/apm1368/petlife-os/actions/runs/39142311828) شکست خورد: در هر ۱۶ حالت CSS=200 و JS=302 بود؛ هیچ حالت موفق اعلام نشد و در موارد timeout پیش از سنجش، hydration «اندازه‌گیری‌نشده» است، نه موفق. تصاویر و شبکهٔ بدون secrets در مرجع QA ثبت شدند. پیش‌بررسیِ بدون پیگیری redirect و کنترل بومی Chromium افزوده شد؛ آزمون تا status/MIME صحیح، hydration مثبت و تعامل واقعی پاس نشود، قرمز می‌ماند. مسیر شبکهٔ runner و طبقه‌بندی redirect برای انتساب دقیق علت ثبت می‌شود؛ نتیجهٔ origin هنوز حدس زده نمی‌شود.

اولویت تازه: Claude اتصال واقعی ادمین به API/بک‌آفیس را ادامه می‌دهد؛ بازطراحی تازهٔ ادمین متوقف است. Codex صفحات سمت کاربر، QA و انتشار را جلو می‌برد. PR #51 Claude از بستهٔ منتشرشده جداست؛ تست API/DB آن با کنترل UI نقش‌ها یکسان نیست و بازخورد QA نقش‌ها در همان PR ثبت شده است.


تشخیص تکمیلی [39144388468](https://github.com/apm1368/petlife-os/actions/runs/39144388468) نیز **ناموفق** است: runner متغیر HTTP proxy تنظیم‌شده نداشت؛ چهار CSS با MIME صحیح 200 و نخستین JS با 302 به مقصد خصوصی/خارج از هدف برگشت. redirect دنبال نشد. پیش‌نیاز شکست خورد و صفر سناریوی مرورگر اجرا شد؛ این قبولی نیست. CI معمول همان head `84044d0` [موفق](https://github.com/apm1368/petlife-os/actions/runs/39144392602) است، اما QA زنده قرمز است و #52 ادغام نمی‌شود. نبود متغیر proxy علت origin را اثبات نمی‌کند. [دستور فقط‌خواندنی مقایسهٔ Next/Nginx/URL عمومی](https://github.com/apm1368/petlife-os/issues/4#issuecomment-6252251588) برای Claude با اتصال موجود ارسال شد. [گزارش اپراتور از VPS](https://github.com/apm1368/petlife-os/issues/4#issuecomment-6252381568) دریافت شد: هر ۱۸ JS از Next مستقیم، Nginx محلی و IP عمومی از داخل VPS، بدون دنبال‌کردن redirect، پاسخ 200 داشتند. این شاهد گزارش‌شدهٔ اپراتور است؛ دستور معادل خودش اجرا شده و JSON دستور پیشنهادی ارائه نشده است. سلامت مسیرهای بررسی‌شدهٔ داخل VPS پشتیبانی می‌شود، اما محل دقیق اختلاف بیرونی و hydration در مرورگر کاربر همچنان تأیید نشده‌اند. تغییر برنامه یا Nginx بر پایهٔ حدس انجام نمی‌شود. هیچ اتصال/تنظیم/سرویس سرور برای این تشخیص تغییر نکرد.

## مشاهدهٔ نشست ۱۹ اکتبر — احراز هویت GitHub ناموفق

CLI مخزن در تلاش واقعی GitHub API، `401 Bad credentials` می‌دهد و git fetch نیز احراز هویت نمی‌شود. هیچ login یا تعویض token/کلید و هیچ تغییری در حساب/نشست Claude انجام نشد؛ دسترسی سابق نشست شاهد دسترسی فعلی نیست. قابلیت اعمال PR و انتشار تازه تأیید نشده و وضعیت ریموت قابل خواندن نیست. قدم لازم، برقراری دوبارهٔ اتصال GitHub همین محیط Codex از مسیر تنظیمات اتصال است؛ توکن یا رمز نباید در چت، کد یا گزارش ثبت شود. کار آمادهٔ محلی پیش از انتشار باید دوباره با ریموت تازه تطبیق داده شود؛ patch محفوظ مجوز جایگزینی کورِ کد جدیدتر نیست.
