# تغییر برند به opetlife

نام نمایشی بنا بر دستور مالک `opetlife` است. نوشتهٔ داخل wordmarkهای ZIP ارسالی `petlife` است؛ برای رعایت نام جدید، رابط از نماد اصلی ارسالی کنار متن قابل انتخاب `opetlife` استفاده می‌کند. تصویر لوگوی دست‌کاری‌شده یا بازتولیدشده ارائه نشده است.

فایل‌های ارسالی در `apps/web/public/brand/opetlife` با همان بایت‌های اصلی حفظ شده‌اند؛ `source-sha256.json` اثر انگشت ۱۳ فایل را ثبت می‌کند. موکاپ‌ها و عکس حیوان، مرجع‌اند و تصویر محصول اجراشده معرفی نمی‌شوند.

تغییرات: هدر و فوتر عمومی، پوستهٔ اعضا، صفحه/پنجرهٔ ورود، نشان ادمین، عنوان مرورگر، نام برنامه، آیکون روشن/تیره و متن‌های نمایشی فارسی/انگلیسی. `Brand.tsx` و CSS module از تکثیر لوگو و نشت CSS جلوگیری می‌کنند. شناسه‌های فنی، نام مخزن، کوکی‌ها، فضای نام packageها، enumهای API، حساب‌ها و دادهٔ ذخیره‌شده تغییر نکرده‌اند.

۵۰ تست مرتبط وب در ۱۱ فایل موفق شدند؛ تغییر آزمون‌های موجود تنها به نام نمایشی مورد انتظار محدود است. lint موفق با سه warning قبلی وب و typecheck وب موفق. برابری کلیدهای fa/en بررسی شده است. نصب frozen-lockfile و build کامل نیز باید در CI همان head نهایی موفق شوند؛ انتشار از موفقیت تست مستقل است.

تصاویر با API کنترل‌شده و فقط GET گرفته می‌شوند. مسیرهای بررسی‌شده: صفحهٔ اصلی، ورود با رمز، افزودن پت در پوستهٔ عضو، و بخش مدارک ادمین. تصاویر قبل از کد واقعی `7685302` هستند؛ برای صفحات قدیمی تصویر ساختگی تولید نشده است. این بررسی به معنای بازبینی مستقل تمام صفحه‌های محصول نیست.

| صفحه | قبل فارسی ۳۹۰ / ۱۴۴۰ | بعد فارسی ۳۹۰ / ۱۴۴۰ |
| --- | --- | --- |
| اصلی | [۳۹۰](opetlife-brand-screenshots/before-landing-fa-390-light.webp) · [۱۴۴۰](opetlife-brand-screenshots/before-landing-fa-1440-light.webp) | [۳۹۰](opetlife-brand-screenshots/landing-fa-390-light.webp) · [۱۴۴۰](opetlife-brand-screenshots/landing-fa-1440-light.webp) |
| ورود | [۳۹۰](opetlife-brand-screenshots/before-password-login-fa-390-light.webp) · [۱۴۴۰](opetlife-brand-screenshots/before-password-login-fa-1440-light.webp) | [۳۹۰](opetlife-brand-screenshots/password-login-fa-390-light.webp) · [۱۴۴۰](opetlife-brand-screenshots/password-login-fa-1440-light.webp) |
| پوستهٔ عضو | [۳۹۰](opetlife-brand-screenshots/before-member-fa-390-light.webp) · [۱۴۴۰](opetlife-brand-screenshots/before-member-fa-1440-light.webp) | [۳۹۰](opetlife-brand-screenshots/member-fa-390-light.webp) · [۱۴۴۰](opetlife-brand-screenshots/member-fa-1440-light.webp) |
| ادمین | [۳۹۰](opetlife-brand-screenshots/before-admin-fa-390-light.webp) · [۱۴۴۰](opetlife-brand-screenshots/before-admin-fa-1440-light.webp) | [۳۹۰](opetlife-brand-screenshots/admin-fa-390-light.webp) · [۱۴۴۰](opetlife-brand-screenshots/admin-fa-1440-light.webp) |

تصاویر انگلیسی و فارسی تیره نیز در همان پوشه‌اند. اسکریپت `browser-opetlife-brand.py` وجود و بارگذاری واقعی نماد، نام صفحه، آیکون‌های مرورگر، حالت روشن/تیره، خطای مرورگر و اسکرول افقی را بررسی می‌کند. نتایج در `opetlife-brand-screenshots/checks.json` ثبت می‌شوند. وضعیت نهایی ادغام/انتشار در Issue #4 و مرجع موجود `docs/ops/stabilization-remaining.fa.md` ثبت می‌شود.
