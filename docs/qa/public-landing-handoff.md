# Cookie spatial landing — handoff

Updated 2026-09-03 on codex/public-landing (base 0d71850). This replaces the old scroll/SVG landing handoff. Claude's H11 branch was not merged or edited.

## Source and scope

The user's latest brief is archived at docs/design/cookie-spatial-landing-brief.md. UI reference boards govern typography, colors and control styling. The supplied Cookie photo governs identity; no age or medical condition was invented. Scope is the public landing and minimal existing auth/onboarding return-route integration.

## Delivered

- /fa and /en: public, persistent 100dvh spatial world, no normal document scroll, stacked sections or carousel.
- Separate ambient, camera, parallax, context-effect and UI layers. Twelve data-driven destinations; normalized wheel input, damped RAF camera movement, magnetic settling, keyboard, native destination selector and touch swipe.
- Cookie-derived day/evening world, actual-photo avatar and separate transparent moving taxi. Clean backgrounds total 707,328 bytes; taxi 269,074 bytes. Precompressed scene WebPs bypass redundant server re-encoding. Scene geography does not reverse with language.
- Mobile frames Cookie above contextual copy. Desktop preserves the wide village. The world-coordinate violet connection links Cookie toward the clinic. Taxi arrival is independent of camera progress; taxi focus and reduced-motion show it parked.
- Native controls, one H1/main landmark, focus indication, polite state announcements and reduced-motion support. Overflow clip prevents focus from scrolling the fixed world.
- Existing email/phone auth and onboarding remain. One-time, 30-minute session intent uses a local allowlist. External/prototype routes are rejected. Cookie remains demo context; Health resolves to the real authorized active pet's health route.
- Future travel, welfare and memories are marked in development. No new domain service, auth bypass, fake Google login or backend integration.

## Integration files

apps/web/features/landing/ contains LandingPage, SpatialLanding, camera, intent, copy, LandingTheme, CSS and tests. Locale page/auth alias expose the entry. Existing account page, onboarding completion/resume and active-pet redirect preserve the chosen destination. Earlier shared palette/auth/shop error recovery changes remain in the working tree and are distinct from this latest landing-only pass.

## Verification

- Full web suite: 114 tests / 36 files passed.
- Landing rerun after wheel/intent corrections: 9 tests passed.
- Production build after taxi/path additions: 53 static pages generated; localized landing 7.24 kB route / 122 kB first-load JS. Build includes lint and type validation.
- Browser: Persian desktop and 375x812 mobile, English 1280x800 desktop; day/evening, identity, context selection, reduced motion and root overflow checked. Mobile document height was 812; focus-scroll issue was identified and corrected with overflow clip. Latest inspected console had no errors.
- No quantitative Core Web Vitals or formal screen-reader/WCAG certification is claimed.

## Explicit limits

People remain part of the still artwork. The taxi removal inferred a slightly different exposed road branch at night; the main village and Cookie are preserved, but the pair is not a pixel-identical lighting conversion. Future destinations are conceptual architecture, not proof of available services.

Live OTP/authenticated data could not be certified because the local API could not reach PostgreSQL in the earlier run. Unit routing checks do not prove OTP delivery. No product rules were changed to conceal this.

Changes are local, not deployed or committed. Earlier scoped staging timed out in automatic approval review before execution; no commit hash is claimed.
