# PET LIFE OS visual source of truth

Saved 2026-09-02 at the user's request. These references override the previous Codex landing styling. They are design references, not permission to introduce new features or fake product behavior. Preserve existing PET LIFE OS domain rules when a board is ambiguous.

## Durable reference index

All 33 original boards are preserved verbatim under `references/`; `manifest.json` maps user image numbers, original paths and SHA-256 hashes. There are 17 distinct boards. This repository document is the durable project memory; it does not depend on retaining this conversation or the user's Downloads folder.

| Boards | Purpose | Implementation ownership / scope |
| --- | --- | --- |
| 01 | Typography, color, navigation, Home and landing day/night camera storyboard | Main shared visual baseline; landing must use the realistic park composition |
| 02–03 | Travel, insurance, welfare, community, memories, settings, blog and content | Preserve for future screens; do not implement missing product behavior |
| 04, 18 | Admin/CRM | User reports Claude implementing H11; do not edit concurrently |
| 05, 19 | Provider OS | Align existing views, preserve booking/access/state rules |
| 06, 20 | Seller OS | Preserve for integration; no Seller UI in this checkout |
| 07, 21 | Shelter OS | Future UI reference; no new shelter feature work |
| 08, 22 | Advanced health | Apply to existing health views only; unknown is not normal |
| 09, 23–24 | Clinic and veterinary visit | Future clinic workflow references |
| 10, 25–27 | Commerce/checkout, partial outcomes, delivery/integrations | Existing commerce rules win when illustrative text is ambiguous |
| 11–12, 28–29 | Calendar, subscription, notifications | Existing care calendar only; future states retained |
| 13–14, 30–33 | Account, household, access, privacy | Preserve pet/household permission semantics |
| 15 | Cross-domain QA and edge states | Regression checklist for every touched existing screen |
| 16 | Auth and public pages | Visual target for auth; keep existing email/phone dev OTP; no fake Google sign-in |
| 17 | Help, support, legal and failures | Reference only for missing routes |

## Decisions that persist

- Screenshots win for visual composition, color, spacing, typography and responsive intent.
- Landing: realistic landscaped pet village at human eye height; owner and dog foreground; pond, clinic, shop, mountain/city background. Day and evening assets follow the same composition. Do not restore the previous isometric SVG island or handmade illustration direction.
- Persian uses Vazirmatn, true RTL and logical spacing; English uses Inter and LTR. Do not mirror scene geography, maps, photos, numbers or brand text.
- Use deep natural green actions, ivory light surfaces, charcoal/slate dark surfaces, restrained violet for intelligence, and semantic state colors. Body text remains readable; tiny/gibberish board text is not literal product copy.
- Preserve public landing → existing Auth → existing onboarding → protected product. Do not make landing an auth gate.
- Images of prototype contacts, monetary values, health states or integrations are examples, not live data. Do not substitute a generic golden retriever for a real user's pet identity.
- Missing APIs/media contracts are gaps to report, not reasons to invent mock production services. ProductSummary currently has no media field; product photography needs the real product media contract before reliable per-product rendering.
- Current local base is H09 `0d71850`, branch `codex/public-landing`. The user's current H11 admin work is elsewhere; do not merge automatically or rewrite Claude commits.

## Review status

The first alignment pass targets shared palette/typography, public landing composition, existing auth visual framing, and confirmed local UI bugs. This is not a claim that all screens on all boards have been implemented or pixel-verified. Read `design-qa.md` in the root for current verification and remaining gaps.

## Latest landing-only direction

The Cookie spatial brief in `cookie-spatial-landing-brief.md` now governs landing: one persistent 100dvh world, internal camera progression, no page sections/carousel; Cookie appearance from the supplied real photo, same scene in day/evening. Stop extending unrelated areas while Claude completes H11. See `docs/qa/public-landing-handoff.md` for current implementation and explicit cinematic gaps. Earlier scroll/SVG handoff claims are superseded.
