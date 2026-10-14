# Approved member glass dashboard

Personal pages used to change their visual surface when moving from home to pet/profile tabs. They now share one warm photographic glass member frame; shop, discovery and booking journeys use a separate service surface. The home uses the member's own pet, permission-aware overview and recorded care events. No screenshot numbers, pet identities, health scores or sample appointments were shipped.

## What changed

- Immersive greeting, recorded-event calendar, pet selector and profile/health/care/memory/document shortcuts.
- Same glass frame and pet identity header across personal routes, including mobile profile tabs.
- Health and care links hidden until current-pet permissions are confirmed; stale permission responses cannot expose the old pet's controls.
- Permission retry, pet-switch failure, partial care load failure and booking-load failure have visible states. Failed reads do not claim that nothing exists.
- Member navigation, notification bell, support and account controls remain connected. Existing booking/catalog/auth logic is retained.
- Generated decorative background disclosed on `/credits`; real pet photos still come from each pet's record.

## Evidence

| | 1440px | 390px |
| --- | --- | --- |
| Before (fa) | [Before](before-fa-1440.webp) | [Before](before-fa-390.webp) |
| Home (fa) | [After](home-fa-1440.webp) | [After](home-fa-390.webp) |
| Profile (fa) | [Profile](profile-fa-1440.webp) | [Profile](profile-fa-390.webp) |
| Home (en) | [After](home-en-1440.webp) | [After](home-en-390.webp) |

`browser-checks.json` covers Persian/English home and profile continuity at both sizes, with controlled API responses. This is not evidence of live-server sign-in or real customer data. The approved source is `../approved-rollout/targets/member-home.webp`.

## Owner summary

قاب شیشه‌ای داشبورد در پروفایل و تب‌های شخصی حفظ شده است.
داده‌ها از سرویس‌های موجود می‌آیند و میان‌برهای بدون مجوز پنهان می‌شوند.
این مرحله مربوط به داشبورد است؛ وضعیت سایر صفحه‌ها و پرامپت‌های تکمیلی در گزارش rollout ثبت شده است.

Proposed board #4 entry: `codex/stab-member-glass — PR pending — approved glass home + persistent personal shell; UI coverage ledger and Codex handoff attached; CI/QA required.`

Publication is blocked on GitHub PR/API access and the required checks. This branch has not been merged or deployed. See the verification section in design-qa.md for exact outcomes.
