# [codex] Apply approved PET LIFE page patterns and complete operational forms

Base: `stabilization/wave-1`. Head: `codex/stab-approved-design-rollout`.

Existing service/content/operations pages still used their previous presentation after the landing release. This combines the approved warm shop, discovery/reservation, support, editorial/contact and admin content patterns, while personal tabs retain the glass member frame. It also completes real owner/clinical/content/availability/seller/subscription actions with permission gates and visible save failures.

Changes are confined to `apps/web`: shared route patterns/shell content, commerce, discovery/reservation/support styling, editorial/contact, admin dashboard and existing feature forms, paired fa/en messages and review artifacts. API/prisma/deploy/workflows and protected AdminShell navigation/CRM/customer-affairs are unchanged. No sample API fixtures are imported by application code.

Validation: frozen install, lint, web typecheck and **669 web tests / 168 files passed**, followed by 12 passing targeted tests on final clinic/content changes. 68 controlled browser checks (40 new-domain + 24 commerce) cover fa/en at 390/1440 for the newly reviewed domains. Before/after screenshots and shop/member evidence are linked in [README.md](README.md). Repository-wide typecheck remains blocked by legitimate Prisma generation in this cloud instance, so this is a draft description, not a claim that required PR gates have passed.

[Single backend handoff](BACKEND-HANDOFF.fa.md) records real contract gaps and source/access issues. [API coverage decisions](API-DISPOSITIONS.md) also lists remaining frontend work; this PR does not certify that every backend endpoint now has a complete UI.

خلاصه برای مالک:
رنگ و الگوی صفحات تأییدشده هماهنگ شده و بخش شخصی همچنان شیشه‌ای می‌ماند.
فرم‌های واقعی، دسترسی‌ها و خطاهای ذخیره تکمیل و ۶۶۶ تست وب پاس شده‌اند؛ تصاویر قبل و بعد پیوست‌اند.
انتشار و ادعای پوشش کامل همهٔ APIها هنوز منوط به رفع موارد ثبت‌شده و بررسی سراسری مخزن است.

Follow-up adds `/provider/clinic` and content-version snapshot inspection. See `VALIDATION.md` for exact test chronology and `FRONTEND-CONTRACT-QUEUE.fa.md` for per-contract review work. No GitHub PR has been opened.
