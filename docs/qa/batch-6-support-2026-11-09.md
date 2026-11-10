# Batch 6 checkpoint — 2026-11-09 UTC

Baseline main `d9d2189c0644d0ac8637b8d2179e94ff29b7a83f`; live SHA last checked `7944df41d990a49364c45f1899bf6e245b43b778`. Independent branch from main; #227 SEO and #228 clinical changes remain on their own branches. Existing local work is preserved; no payment changes, schema migrations, production tickets, public posts, legal content or donations created. About 138 MiB disk free.

Decisions: M-08 prepublication community moderation; M-09 approximate lost-pet location and internal chat; AD-07..AD-11 support queues, response/escalation, reopening and notifications. Existing `community-post.service.ts`, public lost-pet controller/mapper, support escalation, Help/Legal and animal-support tests reviewed; product-design reference and earlier batch-6 evidence consulted. Existing functionality is reused, not recreated.

## B6-SUPPORT-01 — P2 concurrent human escalation duplicates

The existing escalation path checked for an existing reference outside its creation transaction. Two concurrent requests could both see no reference and create distinct escalations. The transaction now locks the `support_cases` row with a parameterized UUID query, rechecks status after acquiring the lock, then reuses or creates the escalation. Locking the parent handles the initial request when no escalation exists and coordinates with ticket-status updates. Ownership is checked before the transaction. Closed/resolved tickets still reject; a ticket closed during the preflight also rejects after locking.

Verification: 5 API unit tests PASS (lock order, reference reuse, status changed to CLOSED/RESOLVED, unrelated owner rejection). Focused API ESLint and diff checks PASS. Added a real HTTP/database E2E regression submitting three concurrent requests and asserting one reference and one row; NOT_RUN locally because no isolated API DB is configured and disk is constrained. Hosted E2E must pass before merge; no claim that this database regression passed yet.

47 existing web tests PASS across PublicHelpViews, AdminHelpLegalView, CommunityFeedView, CommunityPostDetailView, SupportHomeView, PublicLostPetLocale and SupportNeeds. Component evidence only; no new UI source, theme/layout, clinical data or HERO edits.

## Remaining acceptance work

- Community publication/moderation, lost-pet hidden marks/contact/location, sighting privacy and source closure need current real-DB and browser verification. Mapper source excludes raw contact/coordinates from the public incident DTO; this is source review only, not new HTTP evidence.
- Shelter/rehoming application, donation financial invariants and admin scopes remain NOT_TESTED in this batch; no fake organization/outcome/payment was created.
- Help/Legal components have local regression evidence; legal publication visibility and system incidents need server/browser acceptance. Missing legal copy must stay unpublished. No legal policy or article was invented.
- fa/en/de/es full-page, responsive, light/dark and simplified-mode acceptance remain PARTIAL; 47 component tests do not establish all locales/states. Preserve user-authored content language.
- Release remains gated by current CI and the dependency advisories documented in #227. Do not mark batch complete or LIVE_VERIFIED until the relevant merged SHA and production behavior are checked. Next action: run help-center E2E plus current cross-user support and lost-pet privacy suites, then verify authenticated browser flows using isolated fixtures.
