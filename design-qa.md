# Design QA — Cookie landing

Sources: actual Cookie photograph, docs/design/cookie-spatial-landing-brief.md, UI reference board 01. Latest brief supersedes the old scroll narrative.

## Observed corrections

- Fixed malformed dark green token that made the primary CTA transparent.
- Located Cookie in the actual scene at roughly 32%, 89%; mobile now frames Cookie above the copy.
- Moved desktop controls away from Cookie.
- Fixed single wheel notches settling back to overview.
- Fixed keyboard-focus scrolling inside the fixed root with overflow clip.
- Added a separate transparent taxi with quiet movement; reduced motion and taxi focus keep it parked.
- Anchored the Cookie-to-clinic connection to world coordinates.
- Preserved auth destination with a bounded local allowlist; rejected expired/malformed/prototype redirects. Health uses the real active pet after authenticated shell hydration.

## Evidence

Persian desktop/mobile and English desktop inspected in the browser, light/evening. Cookie's face, buff coat and pink ruff were compared against the supplied photo. Mobile viewport/document height: 375x812 / 812. Reduced-motion checkbox and destination changes verified. Latest browser console error list empty. Full suite 114/36 passed, final landing tests 9 passed. Production build, lint and type validation passed after taxi/path additions.

## Limits

The world is a raster 2.5D composition, not a fully modeled 3D environment. People are static. Inpainting below the removed taxi slightly differs between day/night. Future architecture remains conceptual. Real OTP and authenticated data need working local API/PostgreSQL. No blanket whole-product, pixel-perfect, WCAG or performance certification is claimed.
