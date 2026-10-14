# Tehran park landing — visual QA

final result: passed

## Reference and captures

Approved target: `approved-concept.webp` (owner-approved revision of displayed option 3).
Compared directly against `after-fa-1440.webp` at 1440 × 1100 and `after-fa-390.webp` at 390 × 844.
The full-page PNG captures, English captures, mobile open-menu states and browser logs are retained in `/workspace/artifacts/landing-park` in the current development environment.

## Verified in Chromium

- Persian RTL and English LTR at 1440 and 390 pixels; document width equals viewport width in all four checks.
- Warm plum header, photographic Tehran park artwork, Tara and Cookie foreground, Pedram and the terrier, eight service pavilions, readable live headline and CTA, cream introduction and service shortcuts match the selected direction.
- No page runtime errors or broken images in the four captured states.
- Real navigation destinations for all eight services. Desktop pavilion regions have accessible names, visible focus/hover labels and matching links below the scene.
- Mobile gets a deliberate portrait crop of Tara and Cookie, a readable title above the scene, all eight service shortcuts below, and an expandable navigation menu.
- The CTA scrolls to services; mobile menu opens/closes and Escape dismisses it. Reduced-motion and focus-return behavior are also covered by interaction checks and component tests.
- The existing product story and footer remain available through ordinary vertical scrolling. No wheel capture, forced camera journey or carousel.
- Generated artwork is disclosed on `/credits`. Existing third-party photo entries now show licence links and cropped/re-encoded notices. Font licence notices are shipped with the local files.

## Review boundaries

This is visual/browser QA of the landing, not a live API, authentication, partner-onboarding or deployment acceptance test. Signed-out API responses were supplied during browser checks because no backend is running in this environment. Partner links preserve `/provider` through the existing registration/sign-in flow; business-membership provisioning is unchanged and belongs to the backend lane.

Repository-wide TypeScript checking is blocked by absent generated Prisma definitions after engine downloads returned HTTP 403. Frontend-only TypeScript checking passed. No backend, Prisma schema, deployment, workflow or admin-navigation files were changed. GitHub API access is blocked, so board #4 and PR creation are pending.

## Follow-up polish (P3)

The physical Persian signs belong to the Tehran scene artwork. English users have English interactive labels and service links; a separately localized scene asset can be considered later. The mobile crop intentionally prioritizes Tara and Cookie over keeping all eight buildings visible at once.
