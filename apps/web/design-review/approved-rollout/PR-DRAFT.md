# [codex] Apply approved page patterns and connect operational workflows

Base: `stabilization/wave-1`. This is a local draft, not an opened GitHub PR.

Applies the approved glass personal workspace and warm plum/cream domain patterns, and connects the real clinic operations, insurer catalog/team, marketplace statements, health sharing/care suggestions, external travel planning and source administration. Adds manual partner verification portals and the admin evidence queue with private audited document access, separate document/organization decisions and server-provided transitions. Admin access maintenance protects self changes and the last active super admin.

Frontend changes stay in apps/web, packages/ui, packages/design-tokens and packages/validation. Protected backend/deployment/admin navigation/CRM/customer-affairs are not edited. Upstream provenance/search fixes and nullable cart media are included by rebasing onto f3bf064; the cart now uses its actual nullable product image.

Validation: see VALIDATION.md for full versus targeted test chronology and exact browser counts. Before/after and fa/en 390/1440 captures are in screenshots. These use controlled API data, not live mutations. Root API typecheck still needs legitimate Prisma generation.

The single backend handoff is BACKEND-HANDOFF.fa.md. API-DISPOSITIONS.md and the reproducible inventories distinguish real remaining frontend work from aliases/internal routes. Universal backend/UI coverage and production readiness are not claimed.

خلاصهٔ سه‌خطی برای مالک:
الگوهای تأییدشده حفظ و جریان‌های عملیاتی کلینیک، بیمه، سلامت، سفر و مدیریت به API موجود وصل شده‌اند.
احراز هویت همکاران، بارگذاری خصوصی مدارک، صف بررسی و تصمیم مستند ادمین رابط مستقل دارند؛ استعلام رسمی خودکار جعل نشده است.
نتیجهٔ دقیق تست‌ها و تصاویر ثبت شده؛ موارد باقی‌مانده و کمبود واقعی بکند در مستند واحد آمده و انتشار هنوز انجام نشده است.
