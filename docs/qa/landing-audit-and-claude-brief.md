# PET LIFE OS: landing diagnosis and Claude implementation brief

Date: 2026-09-02. This is an implementation brief, not approval of a new visual design.

## Scope and evidence

- QA branch: `codex/qa-debug-h01-h09`, based on `0d71850`.
- Existing uncommitted work: AppShell and OnboardingWizard error recovery, plus their two test files. Preserve these changes.
- The locally available Claude branch ends at `f4dc77c`, five commits ahead of this QA base. Those commits add Seller OS frontend/API work, tests and documentation. Earlier observations that Seller UI/H09-specific tests were absent apply to the QA checkout, not that newer branch.
- Both branches still redirect the locale root to Home. The same redirect exists in foundation commit `180f50a`.
- No dedicated landing implementation or Pet Park/City scene assets were found in the current checkout, the available Claude branch file inventory, or the searched Git path history. This does not establish what may exist in external Figma files, un-fetched branches, or other workspaces.
- No product code changes are made by this landing investigation. No merge, reset, auth rewrite or new rendering dependency is authorized by this brief.

## 1. Current route map

`[locale]` means `fa` or `en`.

| Entry | Current behavior | Responsible source |
| --- | --- | --- |
| `/` | next-intl selects a locale; default is Persian. Locale detection may use request preferences. | `apps/web/middleware.ts`, `apps/web/lib/i18n/config.ts` |
| `/fa`, `/en` | Server redirect to the matching `/home`. No public landing content. | `apps/web/app/[locale]/page.tsx` |
| `/[locale]/home` | Protected AppShell resolves session and household/pets. A 401 sends visitors to `/[locale]/welcome`. Network/server failures show recovery after the QA fix. | `apps/web/app/[locale]/(app)/layout.tsx`, `apps/web/features/app-shell/AppShell.tsx`, `apps/web/hooks/use-app-bootstrap.ts` |
| `/[locale]/welcome` | Auth choice screen: email or phone. | `apps/web/app/[locale]/(auth)/welcome/page.tsx` |
| `/[locale]/account?method=email|phone` | Existing identifier/OTP flow. Successful verification resolves onboarding progress, then navigates to Home or onboarding. | `apps/web/app/[locale]/(auth)/account/page.tsx` |
| `/[locale]/auth` | No route in the inspected checkout. The `(auth)` folder is a route group and does not create this URL. | `apps/web/app/[locale]/(auth)/` |
| `/[locale]/onboarding` | Protected app route; resumes setup. COMPLETED + READY redirects to matching Home. | `apps/web/features/onboarding/OnboardingWizard.tsx` |

Middleware does not enforce authentication. The combination of the locale-root redirect and the protected Home shell produces the auth-first experience.

## 2. Confirmed problems

| Severity | Symptom and cause | Minimal resolution |
| --- | --- | --- |
| P1 | No public product experience: locale root immediately redirects into the protected app. | Once the approved landing exists, render it at the locale root outside AppShell. |
| P1 | Intended immersive Pet Life World is absent. Welcome is an auth scaffold, not an unreachable version of that landing. | Claude must implement the public experience as new development; changing a redirect alone cannot supply it. |
| P2 | Intended `/fa/auth` and `/en/auth` URLs are absent. | Add a thin entry route that reuses existing auth and preserves legacy welcome/account URLs. Do not duplicate OTP logic. |
| P2 | Dev OTP copy says a code was sent, while the development provider writes it to the API log. | Consider dev-specific explanatory copy; keep the existing provider/interface and production behavior separate. |

No P0 data-integrity/security issue is established by this focused landing investigation.

## 3. Existing assets and visual limits

Reusable foundation exists: shared buttons and focus styles in `packages/ui/src`, semantic light/dark colors in `packages/design-tokens/css/tokens.css`, typography in `packages/design-tokens/css/typography.css`, Vazirmatn/Inter in `apps/web/lib/fonts.ts`, locale direction in the root locale layout, and existing ThemeToggle/LocaleSwitcher components.

There is no located park/city artwork, scene, camera sequence or landing-specific component to wire up. The current welcome screen communicates a generic pet-life headline and authentication methods; it does not explain Pet Identity, contextual care, AI connections, vet/services, commerce, permissions or the broader ecosystem.

The preceding QA pass observed Persian and English auth screens in dark mode and tested locale-specific recovery. This focused follow-up is a source/history audit, not a fresh complete visual/accessibility certification. Mobile/desktop breakpoints, both themes, keyboard/focus behavior, reduced motion and screen-reader output still require validation against the actual landing once built.

## 4. Minimal Codex work

Already completed in the preceding QA pass: recoverable bootstrap errors and recoverable onboarding resume errors. Six new tests passed; existing web tests, API unit tests, web lint, both typechecks and both builds passed in that pass. These results do not validate the five newer Claude commits.

No landing route patch is appropriate yet because there is no landing target. Do not replace the root with another login page or an invented generic marketing page. After Claude implements the landing, Codex can verify route wiring, CTA destinations, RTL/LTR, error/loading states and regressions, and apply small confirmed fixes.

## 5. Claude development requirements

### Routing and authentication

1. Work from the latest Claude development state; deliberately preserve/integrate the pending QA fixes without overwriting them.
2. Replace the Home redirect in `apps/web/app/[locale]/page.tsx` with the public landing. It must not mount AppShell, require a session, fetch household/pet data, or depend on API/database availability to tell the product story.
3. Keep locale negotiation in middleware. `/fa` renders Persian and `/en` English. Do not put public landing content inside the narrow centered auth layout.
4. Add `apps/web/app/[locale]/(auth)/auth/page.tsx` as a thin canonical auth entry reusing the current auth choice/OTP flow. Preserve `/welcome`, `/account`, `method` query handling and existing protected-route behavior. Any later canonical redirect changes must preserve locale.
5. Both `شروع کن` and `ورود` lead into the matching locale's existing auth flow via `/auth`; do not invent separate registration/session logic. After OTP, retain the current COMPLETED + READY decision for Home versus onboarding.
6. `ببین چطور کار می‌کند` opens/advances the public explanation without requiring login. Signed-in visitors must still be able to view the public story; merely visiting `/` must not alter session or Active Pet.

### Components and story

Proposed local components under `apps/web/features/landing/` (names are suggestions, not new application architecture):

- `LandingPage`: public composition, localized copy and progressive enhancement.
- `LandingHeader`: brand, locale/theme controls and login.
- `PetLifeWorld`: approved Park/City artwork and scene states, with a static fallback.
- `WorldNavigation`: accessible explicit controls for the story areas.
- `StoryPanel`: readable localized explanation accompanying each area.
- `LandingActions`: primary and secondary CTAs.

Opening scene: immersive `100dvh`, warm ivory/natural green/mint and warm charcoal dark mode, restrained violet only where it clarifies AI. Positioning: «تمام زندگی حیوانت، در یک سیستم هوشمند» / “Your pet’s whole life, connected.” Supporting Persian copy: «سلامت، دامپزشک، خدمات، خرید، سفر و مراقبت؛ همه بر اساس شناخت واقعی از حیوانت.»

Story progression:

1. Meet the pet: Pet Identity is the center of the world, not the user dashboard.
2. Care and health: context exposes a need; explain known information without fabricated diagnoses.
3. Vet and services: show how a relevant action leads to a service/outcome.
4. Commerce and daily life: connect appropriate products/care to pet context.
5. Broader life: travel, animal support, community and memories as the product vision. Clearly distinguish future areas from live functionality; no dead transaction CTAs or claims that all modules are available now.
6. Trust and next step: short explanation of who receives which information, why and for how long, followed by the main CTA. Do not imply unimplemented consent functionality is already live.

AI is a connecting layer of context/signals/recommendations/actions/outcomes across scenes, never a separate building or generic chat hero. Visually communicate Pet Identity → Context → Need → Recommended Action → Outcome → Updated Context. Avoid a giant feature-card grid, dashboard-only hero, neon gradients or excessive cartoon paws.

### Motion, responsive behavior and accessibility

- Establish the approved artwork/storyboard before choosing a rendering technology. Do not make a large 3D library a prerequisite for first paint or routing.
- Use restrained camera/2.5D progression with explicit navigation. Avoid scroll trapping, forced autoplay and essential interactions available only on hover/drag.
- Keep narrative HTML and CTAs available while artwork loads or if rendering fails. A scene failure must not turn the entrypoint into a blank screen.
- Reduced-motion mode uses a static composition or immediate state changes with the same content and controls; no mandatory camera travel, parallax or smooth-scroll sequence.
- On narrow screens, recompose artwork and stack narrative/controls; do not shrink a desktop canvas until labels become unreadable. Respect safe areas and dynamic browser height. Allow content to grow/scroll at zoom or large text sizes instead of clipping it to the viewport.
- Use root `lang`/`dir`, logical spacing properties and localized fa/en catalogs. Mirror reading/navigation order where meaningful, not logos or all artwork indiscriminately. Vazirmatn for Persian; isolate mixed-script runs where needed.
- Semantic headings/navigation/buttons, visible focus, meaningful text alternatives, keyboard-operable scene changes, adequate contrast/touch targets, no color-only meaning, and no animation-dependent access to text. Decorative artwork must not flood the accessibility tree.
- Test light/dark, Persian/English, narrow/wide viewports, keyboard and 200% zoom. Public locale changes should preserve the intended landing state where feasible without losing access to CTAs.

### Likely files

Primary additions: `apps/web/features/landing/*`, approved optimized assets under `apps/web/public/landing/*`, `/[locale]/(auth)/auth/page.tsx`, landing-specific tests.

Primary edits: `/[locale]/page.tsx`, `apps/web/messages/fa.json`, `apps/web/messages/en.json`.

Reuse existing locale layout, design tokens and UI primitives. Change middleware only if a reproduced routing test requires it. No backend/domain changes are required for a public landing.

### Acceptance criteria

- Fresh unauthenticated visits to `/`, `/fa`, `/en` reach public product content and do not request auth/session/household data before interaction.
- Public content and CTAs render with the API/database offline; the immersive scene has a usable fallback.
- Both locales retain correct direction, readable typography and CTA destinations in both themes.
- Primary/login CTAs reach functional existing dev OTP auth; successful seeded-user login and new-user onboarding continue through the existing decision logic.
- Secondary CTA demonstrates the public story without auth, dead ends, scroll traps or misleading future-feature actions.
- Reduced-motion, keyboard, focus, zoom and mobile behavior pass explicit checks.
- Direct protected Home/onboarding/provider/seller links retain access controls. Public landing is never wrapped in AppShell.
- Session persistence, household, Active Pet and transactional pet context remain unchanged by landing navigation.
- Relevant tests, lint, typecheck and production build pass on the integrated latest branch. Run database-backed H01–H09 regression tests against the designated test database, not the seeded development database.

## 6. Regression risks and remaining prerequisites

- Route groups are not URL segments: adding `/auth` must be an actual route, not a rename of `(auth)` alone.
- Do not remove AppShell guards to make the landing public; that would expose/change protected app behavior.
- Preserve email/phone selection, dev OTP, CSRF/session cookies and onboarding completion semantics.
- Do not mount landing scene state in global pet/session stores or silently switch pets during transactions.
- Verify the latest Claude changes before reporting absence of Seller UI or H09 tests.
- Last live QA attempt: API startup failed because PostgreSQL at `127.0.0.1:5432` was unreachable. WSL Docker access required interactive sudo. This prevents live OTP/seed/end-to-end verification; it is not evidence that the seed or auth implementation is defective.
- Existing API lint script could not locate ESLint in that QA environment. Resolve its direct tool dependency separately, without broad dependency upgrades.
