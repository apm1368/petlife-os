# PET LIFE OS — وضعیت فعلی پروژه

آخرین به‌روزرسانی: ۵ نوامبر ۲۰۲۶ (UTC)

این سند، مرجع عملیاتی وضعیت فعلی پروژه است. اسناد handoff قدیمی در `README.md`
و `docs/product/` همچنان برای تصمیم‌ها و تاریخچه مفیدند، اما جایگزین وضعیت جاری
نیستند.

## شاخه و انتشار

| مورد | وضعیت |
| --- | --- |
| شاخهٔ یکپارچه‌سازی و انتشار | `main` |
| آخرین commit موجود روی `main` در زمان ثبت این سند | `3fe6bb0111c68f72d08d662f40da875ce8be1518` |
| آخرین نسخهٔ تأییدشدهٔ زنده | `3fe6bb0111c68f72d08d662f40da875ce8be1518` |
| دامنه | `https://opetlife.ir` |
| health endpoint | `/api/health/ready` و `/api/health/version` |
| وضعیت آخرین health check | API، PostgreSQL و Redis سالم؛ `environment` هنوز نادرست `staging` گزارش می‌شود |

شاخهٔ پیش‌فرض GitHub در ۵ نوامبر ۲۰۲۶ بررسی شد و `main` است. جریان واقعی CI/CD
و انتشار نیز از `main` استفاده می‌کند. اجرای زنده در همان SHA قرار دارد، اما
اصلاح نام محیط به `production` در PR #101 منتظر review و merge است؛ تا آن زمان
هیچ اعلام production-verified برای تغییرهای پس از `3fe6bb0` مجاز نیست.

## آنچه در مسیر اصلی است

- احراز هویت OTP و کنترل‌های مدیریتی برای روشن/خاموش‌بودن OTP و ورود Google.
- مدیریت نقش‌ها، فهرست کاربران ادمین، moderation نظر و محصول، و کنترل‌های
  عملیاتی ادمین.
- فروشگاه، سفارش/پرداخت، بیمه، سفر، مکان‌های pet-friendly، خدمات، کلینیک و
  Pet Taxi با API و مسیرهای واقعی.
- جریان رزرو: انتخاب خدمت/حیوان/زمان، نگه‌داری slot، پرداخت، لغو، تغییر زمان،
  waitlist، نظر و تاریخچهٔ رزرو.
- سلامت، مراقبت و تقویم مراقبت.
- پشتیبانی کاربر: ایجاد درخواست، تاریخچه، وضعیت و گفت‌وگو.
- الگوی مشترک طراحی برای مسیرهای عمومی، رزرو، شخصی، عملیات و ادمین؛ RTL/LTR و
  Light/Dark پشتیبانی می‌شود. لندینگ و لوگو قفل‌اند و خارج از این الگو نگه داشته
  شده‌اند.

## تغییرهای در انتظار ادغام

| PR | محتوا | وضعیت |
| --- | --- | --- |
| #98 | اتصال قابل audit الگوهای پیامکی فراز در ادمین | CI در حال اجرا؛ review لازم |
| #99 | `packages/ui`، توکن‌ها و Storybook مشترک | CI سبز؛ review لازم |
| #100 | زیرساخت پرداخت، کیف پول و ledger | CI سبز؛ review لازم |
| #101 | قرارداد انتشار و smoke production | CI سبز؛ review لازم |
| #59 | بازنویسی قدیمی auth/Faraz | Draft و دارای conflict؛ ادغام مستقیم ممنوع |

## موارد باز و قواعد ادامهٔ کار

1. فقط از `main` شاخه بگیرید و پس از CI سبز به `main` ادغام کنید.
2. قبل از اعلام انتشار، SHA خروجی `/api/health/version` باید با merge commit
   برابر باشد.
3. چهار PR #98 تا #101 فقط پس از review مستقل و CI سبز به‌ترتیب وابستگی ادغام
   می‌شوند. PR #100 باید پیش از هر کنترل مدیریتی جدید پرداخت ادغام شود؛ PR #99
   نیز پیش‌نیاز بازطراحی صفحات است.
4. PR #59 (`claude/integrate-design-1c0280b`) عمداً خارج از مسیر ادغام است:
   بازنویسی قدیمی auth/Faraz در آن با قرارداد فعلی Google OAuth و احراز هویت
   سازگار نیست. فقط بخش‌های بررسی‌شده و سازگار آن، در صورت نیاز، جداگانه وارد
   `main` شوند.
5. شاخه‌های unmerged قدیمی را بدون بررسی diff حذف نکنید؛ ممکن است کد مفید یا
   شواهد انتشار داشته باشند. شاخه‌های merged و docs-only قبلاً پاکسازی شده‌اند.

## صف نهایی‌سازی و backlog

مرجع اولویت و پذیرش هر مورد، `docs/decisions.md` است. تا وقتی PRهای پایه ادغام
نشده‌اند، ساخت قابلیت وابسته روی شاخه‌ای موازی ممنوع است؛ این کار از دوباره‌کاری
و تعارض در schema، ledger، permission و design system جلوگیری می‌کند.

| اولویت | خروجی | وضعیت و پیش‌نیاز | سیاست برای API/قرارداد ناقص |
| --- | --- | --- | --- |
| P0 | انتشار production قابل‌ردیابی | PR #101؛ CI سبز، منتظر review | بدون دسترسی DNS/سرور، فقط smoke contract، health و runbook در کد می‌ماند؛ تغییر زیرساخت در backlog عملیاتی ثبت است. |
| P0 | الگوهای پیامکی فراز و audit | PR #98؛ CI باید سبز و سپس review شود | credential، pattern نهایی و گزارش delivery از provider خارج از repo هستند؛ binding امن، retry و audit در محصول باقی می‌ماند و اتصال واقعی فقط با secret محیطی فعال می‌شود. |
| P1 | design system مشترک | PR #99؛ CI سبز، منتظر review | بازطراحی صفحه‌ها تا ادغام `packages/ui` انجام نمی‌شود؛ صفحات موجود دست‌نخورده و لندینگ/لوگو قفل باقی می‌مانند. |
| P1 | پرداخت، wallet و ledger | PR #100؛ CI سبز، منتظر review | credential زیبال، حساب‌های تسویه و statement بانکی در backlog عملیاتی‌اند؛ هیچ کلید یا fallback مالی ساختگی وارد repo نمی‌شود. |
| P1 | کنترل روش پرداخت و emergency controls | بعد از merge #100 | فقط gate روی جریان‌های واقعی ساخته می‌شود؛ اگر قرارداد payout/provider کامل نباشد، switch اجرا را متوقف می‌کند و ledger را تغییر نمی‌دهد. |
| P2 | تطبیق طراحی ماژول‌ها | بعد از merge #99 و تأیید مالک طراحی | برای surface بدون API، تنها loading/empty/permission state و feature-flag قابل‌حذف مجاز است؛ داده یا شخصیت ساختگی ممنوع است. |
| P2 | اتصال شریک‌ها (تاکسی، بیمه، حمل‌ونقل) | قرارداد، sandbox و مالک عملیاتی لازم است | manual fallback و backlog قراردادی؛ هیچ API شریک با حدس endpoint یا secret پیاده‌سازی نمی‌شود. |
| P2 | عملیات production | دسترسی مجاز زیرساخت و owner لازم است | backup/restore rehearsal، Sentry، uptime، DNS و secrets در backlog عملیاتی با evidence ثبت می‌شوند، نه با mock موفق. |

### تعریف آماده‌بودن برای انتشار

یک مورد فقط وقتی `LIVE_VERIFIED` است که: PR review شده و CI سبز باشد، به `main`
ادغام شود، migration امن در صورت نیاز اجرا شود، SHA خروجی
`/api/health/version` با SHA ادغام برابر باشد، و smoke test production موفق باشد.
تا قبل از این مراحل، وضعیت درست «آمادهٔ review» یا «آمادهٔ release» است، نه
«روی سایت».

## بررسی محلی و انتشار

```bash
pnpm --filter @petlife/types build
pnpm --filter @petlife/config build
pnpm --filter @petlife/web typecheck
pnpm --filter @petlife/web exec vitest run
curl -fsS https://opetlife.ir/api/health/ready
curl -fsS https://opetlife.ir/api/health/version
```

برای جزئیات معماری و قراردادها، از `docs/product/` و منبع حقیقت داده یعنی
`apps/api/prisma/schema.prisma` استفاده کنید.
