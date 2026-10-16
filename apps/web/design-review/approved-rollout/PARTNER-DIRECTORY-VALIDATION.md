# فهرست واقعی همکاران

مبنا هنگام ساخت شاخه: origin/stabilization/wave-1 در 9f2048d. این اصلاح فقط فهرست ارائه‌دهندگان و فروشندگان است؛ تکمیل عملیات 360 کلینیک/فروشنده ادعا نمی‌شود.

فهرست قبلی فقط ۳۰ مورد را می‌گرفت، دکمهٔ جست‌وجو و صفحه‌بندی نداشت و loading آن عملاً فعال نمی‌شد. اکنون ورود به صفحه درخواست واقعی می‌فرستد، جست‌وجوی صریح صفحه را به یک برمی‌گرداند و صفحه‌های بعد با total/pageSize سرور قابل دریافت‌اند. خطا با empty یکی نیست؛ متن جست‌وجوی واردشده پس از شکست حفظ می‌شود. پاسخ قدیمی پس از تغییر نوع/صفحه اعمال نمی‌شود.

مطابق قرارداد موجود GET /admin/providers و GET /admin/sellers، مجوز customer.view یا verification.manage برای خواندن کافی است. ناوبری این دو مسیر نیز همین قاعده را رعایت می‌کند؛ لینک بررسی مدارک فقط برای verification.manage است. API تازه، تغییر احراز هویت، mutation یا migration ندارد.

شش تست فهرست پاس شد: درخواست اولیه/loading، نبود مجوز، صفحه‌بندی/جست‌وجو، تلاش مجدد/حفظ متن، لینک مجاز و پاسخ دیررس. typecheck وب و lint وب پاس شدند (سه warning موجود). بعد از تغییر ناوبری نیز ۱۰ تست فهرست/منو، typecheck وب و lint فایل‌های تغییرکرده پاس شدند. پس از ادغام مبنای #31 و حفظ هر دو تست مجوز منو، هر ۲۰ تست تنظیمات/منو/فهرست نیز پاس شد. CI head نهایی همچنان لازم است.

ثبت تصویری با browser-partner-directory-review.py فقط GET/OPTIONS را می‌پذیرد. before از worktree مبنا گرفته می‌شود. اجرای نخست بعد از کامپایل سرد ۴۰۵ ثانیه‌ای به مهلت ۱۸۰ ثانیه رسید و شاهد موفق نیست؛ هر ۸ تصویر نهایی و ۴ تصویر قبل بدون overflow یا خطای مرورگر تأیید شدند. فیلد status که به‌اشتباه در fixture ارائه‌دهنده بود حذف شد و تصاویر نهایی دوباره ثبت شدند؛ API ارائه‌دهنده فقط verificationStatus دارد.

| مسیر | فارسی ۳۹۰ | فارسی ۱۴۴۰ |
|---|---|---|
| ارائه‌دهندگان | [بعد](partner-directory-screenshots/providers-fa-390.webp) / [قبل](partner-directory-screenshots/before-providers-fa-390.webp) | [بعد](partner-directory-screenshots/providers-fa-1440.webp) / [قبل](partner-directory-screenshots/before-providers-fa-1440.webp) |
| فروشندگان | [بعد](partner-directory-screenshots/sellers-fa-390.webp) / [قبل](partner-directory-screenshots/before-sellers-fa-390.webp) | [بعد](partner-directory-screenshots/sellers-fa-1440.webp) / [قبل](partner-directory-screenshots/before-sellers-fa-1440.webp) |

نسخه‌های انگلیسی با en در نام فایل‌اند. fixtureها دادهٔ زنده نیستند؛ روی سرور چیزی نوشته نشده است. ادغام، انتشار و گواه سلامت سایت مراحل مستقل‌اند.
