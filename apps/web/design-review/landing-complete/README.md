# Landing completion: story, footer and auth overlays

Branch: `codex/stab-landing-footer-auth`

Base: `stabilization/wave-1`. This fresh branch includes the previously approved park implementation as an explicit dependency and supersedes `codex/stab-landing-tehran-park` for reviewing the complete landing. Neither branch has been merged or deployed.

## What changed

The page now continues from the park into Cookie's identity, three steps to using the product, everyday care/travel, information-sharing principles, animal support, partner access and a final account CTA. The footer groups real service, community, support, partner and privacy-settings routes. Existing licensed photographs and owner-supplied Cookie imagery are reused; the app screenshot is explicitly labelled as a preview.

Client navigation to sign-in, registration, method selection and password recovery uses Next.js intercepted routes in the `@modal` slot. The existing auth page components and services are reused unchanged. Direct URLs and reloads retain complete standalone pages styled in the campaign palette. Native dialogs provide modality, background inertness and Escape; the overlay preserves its originating URL, restores scrolling/focus on dismissal and clears after successful navigation.

Account/phone/registration business logic, API, Prisma, deployment, workflows and admin navigation were not edited. Provider entry preserves `returnTo`; creating a general account does not automatically create a business membership, which the partner section explains. No legal policy text or contact details were invented; the privacy link is the existing account privacy-settings route.

## Validation

- Frozen-lockfile installation passed; no manifest/lockfile changes.
- Full web suite: 158 files / 617 tests passed, no skipped/disabled tests.
- Final focused landing/modal suite after refinements: 3 files / 21 tests passed.
- Repository lint passed: 5 existing warnings, no errors.
- Frontend TypeScript passed independently.
- Repository-wide TypeScript remains blocked/failed in the API because verified Prisma engine downloads return HTTP 403 and generated definitions are absent. This was not worked around by changing backend source or weakening verification.
- Chromium: fa/en, 390px and 1440px; no horizontal overflow or runtime errors. The final full-page captures scroll through and decode lazy-loaded photos before capture.
- Login, password selection, registration, multi-step dismissal, Escape, focus return, backdrop click, browser back/forward, direct URL/reload and successful redirect clearing the overlay were exercised.
- Controlled API responses verified visible password/registration errors and partner `returnTo` preservation. These are UI integration checks, not evidence of live server authentication or account creation.

The JSON evidence in this folder records browser checks. Full-resolution PNGs and additional English/modal/error captures remain in `/workspace/artifacts/landing-complete` in the current environment.

## Persian screenshots

| Viewport | Whole page | Footer | Sign in | Registration |
| --- | --- | --- | --- | --- |
| 1440px | [Page](page-fa-1440.webp) | [Footer](footer-fa-1440.webp) | [Sign in](login-fa-1440.webp) | [Register](register-fa-1440.webp) |
| 390px | [Page](page-fa-390.webp) | [Footer](footer-fa-390.webp) | [Sign in](login-fa-390.webp) | [Register](register-fa-390.webp) |

Before: [desktop footer](before-footer-fa-1440.webp), [mobile footer](before-footer-fa-390.webp), [desktop auth](before-auth-fa-1440.webp), [mobile auth](before-auth-fa-390.webp).

## Owner summary

ادامهٔ لندینگ با تم کرم و آلویی، معرفی کوکی، خدمات، اعتماد و حمایت تکمیل شد و فوتر مرتب شد.
ورود و ثبت‌نام داخل مودال باز می‌شوند؛ فرم‌ها و منطق قبلی حفظ شده‌اند و مسیر مستقیم هم کار می‌کند.
این نسخه برای بررسی است؛ PR، ادغام و دیپلوی انجام نشده و ادامهٔ انتشار به CI و QA نیاز دارد.

## Publication status

PR and board #4 update are pending GitHub API access and completion of the repository-wide gate. No direct push to `stabilization/wave-1` or `main`. Proposed board line:

`codex/stab-landing-footer-auth — PR pending — complete landing + footer + auth modals; 617 web tests passed; global typecheck blocked by Prisma environment; supersedes prior landing branch.`

## Review revision: localized pavilion signs

English uses a separate AI-edited park artwork with all eight physical pavilion signs in English. Persian retains its original artwork. Hero, auth modal and standalone auth share the locale-specific image source. The general hero headline now addresses every pet owner without naming Cookie.

Screenshots: [English desktop](signs-en-1440.webp), [English mobile](signs-en-390.webp), [Persian desktop](signs-fa-1440.webp), [Persian mobile](signs-fa-390.webp).

Revision validation: lint passed (five existing warnings); web typecheck passed; three focused suites passed (21 tests), including locale artwork regression coverage. Browser screenshots verified both locale image sources and no horizontal overflow at 390px and 1440px. The initial full-suite attempt was interrupted after timeouts during concurrent compilation; it is not a passing full-suite result. Existing repository-wide Prisma typecheck and PR/board access limitations above remain.
