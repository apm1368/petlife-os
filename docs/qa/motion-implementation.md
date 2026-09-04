# Shared motion and visual alignment — 2026-09-03

Reference: supplied PET LIFE OS boards, especially design system/blog, admin, and QA states. The screenshots remain authoritative; external motion guidance does not replace their visual direction.

## Implemented batch

- All locale routes receive an opacity-only entry transition (180ms). Children are not keyed or remounted; fixed-position elements remain viewport-relative. Interrupted animations restore full opacity.
- Shared buttons have a restrained press response (120ms), disabled while loading/disabled. Large button height corrected to an actual 52px utility.
- Dialog and Sheet use Motion while retaining native modal focus/escape semantics. Accessible title IDs are unique. Sheets now anchor to the bottom on mobile, inline-end on desktop, and respect safe-area insets.
- Reduced-motion preference disables route animation and spatial press/sheet transitions.
- Shared palette aligns forest green, ivory and charcoal surfaces with supplied references; status meanings are preserved.
- Local operational preview navigation uses a desktop sidebar and mobile horizontal navigation instead of two stacked navigation walls. No auth/session or business permissions were fabricated.
- Error recovery uses a compact alert with an outlined icon and omits empty message spacing.

## Guidance used

- [Framer Motion overview](https://www.framer.com/dictionary/framer-motion)
- [Motion React installation](https://motion.dev/docs/react-installation)
- [Motion accessibility](https://motion.dev/docs/react-accessibility)
- [UI UX Pro Max source](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill): queried UX guidance for reduced motion and navigation; applied restrained animation and accessible interaction guidance, not generated replacement styling. Its Next.js-version-specific recommendations were not used to change this Next.js 14 application.

## Verification and limits

TypeScript passed. 39 tests across nine relevant navigation, preview, shell and content suites passed. Lint has no errors; four existing content image warnings remain.

This is a shared-component batch, not certification of all 94 routes against populated screenshot states. API/database are unavailable, so data-loaded operational screens, CMS mutations and publishing remain unverified. No mock data or backend behavior was introduced. See visual-inventory.md for per-route follow-up.
