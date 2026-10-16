# تاریخ تولد پت و خوانایی بررسی مدارک

مبنای واقعی قبل: `7685302ae59de14e8e4e7717ad0d4169dad65828` از `origin/stabilization/wave-1`؛ هیچ فایل تاریخی جایگزین کد جدید نشده است.

- راه‌اندازی اولیه، افزودن پت و ویرایش هویت از انتخابگر مشترک استفاده می‌کنند: پیش‌فرض فارسی شمسی، امکان انتخاب میلادی، ذخیرهٔ ISO و حفظ همان روز هنگام تغییر تقویم. روز نامعتبر هنگام تغییر ماه در خود انتخابگر اصلاح می‌شود.
- سن نامعلوم مانع ساخت پت نیست. مسیر «فعلاً نمی‌دانم؛ ادامه» پت لازم برای مراحل بعد را می‌سازد؛ نه تاریخ تخمینی جعلی و نه سن صفر ارسال می‌شود. API و قرارداد مشترک همین اختیار را می‌پذیرند؛ محدودیت‌های سن واردشده حفظ شده‌اند. تغییر schema یا migration ندارد.
- شکست ثبت پیشرفت، تاریخ واردشده را نگه می‌دارد؛ تلاش مجدد از پت ساخته‌شده استفاده می‌کند.
- لینک مستقیم «بررسی هویت و مدارک» فقط برای مجوز موجود `verification.manage` نمایان است. راهنمای فارسی و ردیف‌های دارای عنوان مشخصِ همکار، وضعیت، شمار مدارک و زمان ارسال اضافه شده‌اند. بررسی همچنان دستی است؛ استعلام رسمی متصل معرفی نمی‌شود.

بررسی‌های محلی: ۲۴ تست وب در هفت فایل و ۵ تست API هویت پت با PostgreSQL/Redis محلی ایزوله موفق شدند. lint وب و API موفق، با سه warning از قبل موجود وب؛ typecheck هر ۹ بستهٔ workspace موفق. اجرای اولیهٔ موازی تست وب یک timeout و یک اشکال واقعی غیرفعال‌ماندن دکمهٔ رد کردن را آشکار کرد؛ دکمه اصلاح و مجموعه با worker واحد بدون تغییر timeout یا skip دوباره موفق شد.

تصاویر، دادهٔ کنترل‌شدهٔ مرورگر دارند؛ دادهٔ واقعی سایت یا تأیید کاربر انسانی نیستند. اسکریپت `browser-pet-dates-admin.py` فقط GET را در مرورگر مجاز می‌کند. بررسی API واقعی جداگانه روی دیتابیس تست انجام شد. ویرایش هویت با تست انتخابگر مشترک پوشش دارد، نه ادعای بازبینی جداگانهٔ تمام صفحات.

| مسیر | قبل فارسی ۳۹۰ / ۱۴۴۰ | بعد فارسی ۳۹۰ / ۱۴۴۰ |
| --- | --- | --- |
| `/fa/onboarding`، مرحلهٔ سن | [۳۹۰](pet-dates-admin-screenshots/before-birth-onboarding-fa-390.webp) · [۱۴۴۰](pet-dates-admin-screenshots/before-birth-onboarding-fa-1440.webp) | [۳۹۰](pet-dates-admin-screenshots/birth-onboarding-fa-390.webp) · [۱۴۴۰](pet-dates-admin-screenshots/birth-onboarding-fa-1440.webp) |
| `/fa/pets/new`، جزئیات | [۳۹۰](pet-dates-admin-screenshots/before-birth-add-pet-fa-390.webp) · [۱۴۴۰](pet-dates-admin-screenshots/before-birth-add-pet-fa-1440.webp) | [۳۹۰](pet-dates-admin-screenshots/birth-add-pet-fa-390.webp) · [۱۴۴۰](pet-dates-admin-screenshots/birth-add-pet-fa-1440.webp) |
| `/fa/admin/verification` | [۳۹۰](pet-dates-admin-screenshots/before-verification-queue-fa-390.webp) · [۱۴۴۰](pet-dates-admin-screenshots/before-verification-queue-fa-1440.webp) | [۳۹۰](pet-dates-admin-screenshots/verification-queue-fa-390.webp) · [۱۴۴۰](pet-dates-admin-screenshots/verification-queue-fa-1440.webp) |

بررسی انگلیسی و نتیجهٔ عرض/خطای مرورگر در `pet-dates-admin-screenshots/checks.json`؛ وضعیت انتشار مستقل از تست و تصاویر است و در Issue #4 ثبت می‌شود.
