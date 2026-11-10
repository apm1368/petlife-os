# Owner review checklist — 2026-11-10

This is not launch approval or complete QA. Read the newest release checkpoint and exact deployed SHA first; older PASS records do not automatically apply to later builds.

## Safe public checks

- In fa/en/de/es, open services: header controls must be reachable on mobile, menu opens normally and Escape closes it, destinations keep the locale. Check German/Spanish theme labels, grouped footer, keyboard focus and light/dark/simple. The 320/390/768/1440 public-navigation samples have actual production evidence at `1f274d7`; this does not certify every page.
- Inspect the landing without changing its HERO: image and relative composition must remain the approved version. Four fa/de mobile/desktop geometry comparisons passed at `1f274d7`. A clipped optional display control in the existing German mobile ParkHeader remains an independently noted visual gap, not fixed by the separate public header.
- Registration: inspect labels, unverified-phone explanation, blank/invalid form being disabled and mismatch feedback; navigate to same-language password login. Four read-only flows passed at `1f274d7`; no account, SMS or actual login was performed.
- Help/legal/status: **do not accept merely because HTML returns 200**. QA-PUBLIC-ASSETS-01 previously found `/de/legal` with three missing assets; #240 is deployed at `1f274d7`. Twelve asset checks and 36 real page scenarios pass, plus four response-complete search retests. Accept only those observed empty/unpublished/unavailable states; published content and full a11y/role/error matrices remain partial.
- Shop may legitimately be empty while no reviewed products/offers exist. Do not accept demo products as inventory or treat zero products as a complete real catalog. A legitimate reviewed offer and authorized safe purchase fixture are still needed.

## Authorized account/staging review (not yet production-certified)

- Account language persists across refresh/navigation. Test household owner/member/stranger roles in controlled fixtures, invitation request/explicit approval/revocation, two memberships and removal from one only.
- Pet selection/permissions, profile/photo, health/document/calendar and temporary clinical consent must preserve household isolation. Use test records, not private patient screenshots.
- Seller central-product selection/addition request/admin duplicate review/offer separation, booking/provider lifecycle and support ownership need controlled fixtures. Do not create unwanted public posts, incidents, shelter records or real bookings merely for QA.
- Financial tests belong in isolated providers/databases. Do not make a real charge/refund/settlement or manufacture ledger/stock evidence.
- Public memorial withdrawal covers its publication mechanism, not independently public original URLs or prior CDN copies. Original bucket/CDN/direct-object configuration still lacks verified read-only evidence.

## External dependencies and acceptance

Jajiga remains selected but extraction/content-use authorization is missing; no real synchronization/import or nationwide/live-availability claim. Digikala import remains unverified without accessible authorized data/feed/content rights. German/Spanish SMS delivery/templates are not certified. No new integration/editorial campaign/mobile app is part of this hardening batch.

Report a problem with route, locale, theme/display mode, viewport, approximate UTC time and safe reproduction. Do not send passwords, session tokens, credentials or private patient/customer data. Supply controlled QA access through the approved secret channel, not committed files or public PR comments.
