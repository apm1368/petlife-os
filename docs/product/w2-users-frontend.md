# W2 users frontend

Frontend increment depends on backend PR #75 (reviewed contract 6296337). No backend implementation is changed by this frontend commit. Do not release the pages before the matching endpoints and migration are available.

- `/[locale]/admin/users`: explicit text/kind filters, pagination, masked contact details, all returned role/business relationships, dates, loading/empty/error/forbidden states.
- `/[locale]/admin/users/[id]`: available identity/relationship summary, household/pet counts, and link to the existing customer record. Does not claim counts constitute the full W2-5 profile or invent missing tabs.
- Admin navigation is gated by customer.view; API enforces actual access. Requests use no-store and abort stale reads. Changing filters, identity or role cannot show an older request's data; revoked view permission hides loaded rows immediately.
- Four new role names have Persian/English labels. SERVICE_ADMIN assignment is deliberately not offered until an audited serviceScopes management contract exists; existing assignments remain readable. This is not server-side scope enforcement and does not repair PR #74's backend authorization gaps.
- Fix the existing admin SYSTEM theme to honor OS dark mode; preserve an explicit LIGHT override. Shared public/partner styles are unchanged.

Validation: focused directory/access/navigation/link tests; web typecheck and lint; local Chromium list/detail screenshots at 390 and 1440 pixels with light/dark OS preferences, checking actual background color and horizontal overflow. Browser API responses are synthetic, read-only fixtures, not a claim of end-to-end backend validation or production deployment.

Backend handoff: [Claude prompt](claude-w2-backend-handoff.md). No SMS sent, secrets changed or production records created.
