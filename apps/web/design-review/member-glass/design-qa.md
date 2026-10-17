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
