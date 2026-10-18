# Member glass: design and validation

Visual review result: passed for this member-dashboard stage. This is not approval to merge or deploy.

Compared the approved member-home target with the final Persian home and profile captures. The warm photographic backdrop, translucent plum panels, greeting, pet identity and persistent personal frame follow the approved direction. Desktop retains the right-to-left calendar/pet hierarchy; mobile stacks content with readable controls. The calendar uses recorded events rather than fabricated hourly positions or health scores.

Controlled browser checks passed for fa/en at 1440px and 390px: no horizontal overflow, no page errors, and the personal glass frame remains on profile navigation. Pet switching, permission changes, stale access responses, failure rollback and light/dark surface changes were also checked. Fixtures are test data, not evidence of live-server customer sign-in.

## Verification

- Frozen-lockfile install: passed.
- Repository lint: passed, with five existing warnings.
- Web TypeScript check: passed.
- Full web test suite: 646 tests passed in 162 files.
- Repository-wide TypeScript check: blocked in the unchanged API by missing generated Prisma client exports. Official Prisma engine checksum download returned HTTP 403. No checksum check, TLS check or test was weakened.
- Git diff whitespace check: passed.

CI must generate the normal Prisma client and pass repository checks, followed by QA review. The branch is not merged or deployed. Shop, booking, content and admin stages remain separately tracked in ../approved-rollout/README.md.


## Pet list continuation — 2026-10-17

final result: passed (scoped to the pet-list design and controlled states)

Visual grounding: approved-rollout/targets/member-home.webp supplies the already-approved glass language; the pet list adapts that shared frame rather than claiming a pixel-identical dashboard. Baseline and after fa/en at 390/1440 are in pet-list-screenshots. Inspected actual Persian mobile and desktop captures: the header wraps, long names stay inside cards, photographs remain the pet's own image, missing images use the existing Avatar fallback, and action labels no longer overflow their buttons. Existing navigation and logo remain intact.

P1 header/control overlap and clipped action labels: fixed. Healthy-state console/page errors, HTTP failures, horizontal overflow and button/heading clipping: none in the recorded four viewport/locale checks. Empty state and controlled save failure: passed; store rollback/no automatic retry additionally verified with the real useActivePet hook in unit tests.

Limits: historical fixture produces a known announcement 404 in comparison captures; the separate clean run supplies the valid public-settings response and has zero HTTP/console errors. These are controlled-data checks, not live authentication or all-page acceptance. CI is independently attached to the final PR head. No claim of full project/design completion or deployment is made.
