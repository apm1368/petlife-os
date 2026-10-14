# [codex] Keep personal pages in the approved glass dashboard

Personal navigation used to change the dashboard's visual surface when opening a pet profile. The member frame now keeps the approved warm glass treatment across profile, health, care, memories and account routes, while service and purchase journeys use their own surface. Home shows the member's own pet and recorded events, and permission-dependent links stay hidden until access is confirmed for the current pet.

Pet switching reports failures and rolls back. Booking/reminder read failures are distinct from empty results. Access failures offer retry, and a late response from the old pet cannot expose its controls. Existing APIs, auth and transactions are retained. Generated background credits and the complete staged rollout/coverage handoff are included under apps/web/design-review.

## Files

MemberFrame, MemberNavigation, GlassMemberHome/MemberHomeView, scoped surface CSS, usePetAccess and regression tests, credits and review evidence. No backend, schema, workflow, deployment or protected admin navigation changes.

## Screenshots

See apps/web/design-review/member-glass/README.md for Persian 390px and 1440px before/after home and profile screenshots, plus English layouts and controlled-API browser evidence. Approved target: apps/web/design-review/approved-rollout/targets/member-home.webp.

## Validation

See design-qa.md for final exact results. Repository-wide typecheck is locally blocked by the missing generated Prisma client and HTTP 403 on the official engine checksum download; no verification was weakened. CI must generate the normal Prisma client and pass all checks before QA/merge. Browser evidence uses controlled responses, not live customer sign-in or data.

## خلاصه برای مالک

قاب شیشه‌ای در داشبورد و تب‌های شخصی حفظ می‌شود.
میان‌برها تابع مجوز واقعی‌اند و خطاهای بارگذاری و تغییر پت قابل مشاهده‌اند.
این PR مرحلهٔ داشبورد است؛ سایر صفحه‌های تأییدشده در گزارش rollout وضعیت جدا دارند.
