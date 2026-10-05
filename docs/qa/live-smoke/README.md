# Live smoke (canonical server)

Run on the server after a deploy, from `/var/www/petlife-os/apps/api`:

```bash
set -a; . ./.env; set +a
export PRISMA_CLIENT=/var/www/petlife-os/node_modules/.pnpm/node_modules/@prisma/client
node ../../docs/qa/live-smoke/functional-smoke.js   # FREE + PAID entitlement scenarios
node ../../docs/qa/live-smoke/sprint-smoke.js       # chat, clinic, taxi, animal support, content
node ../../docs/qa/live-smoke/g8-g10-smoke.js       # G8–G10 read endpoints
```

Prerequisite: `apps/api/prisma/seed-sprint-demo-extras.ts` has run on the server (it is idempotent). It creates the
two QA accounts the smoke writes with:

| Account | Plan | Purpose |
|---|---|---|
| `qa-smoke-free@example.test` | free | Paid features (`care.reminders`, `vet.share`) must be refused with `409 SUBSCRIPTION_FEATURE_NOT_INCLUDED` and the matching `details.key`. Core pet edits must work. |
| `qa-smoke-paid@example.test` | plus (QA membership state, no payment recorded; 365-day period refreshed by the seed) | The same features must work end to end. |

Rules:
- Entitlements are asserted, never bypassed. A FREE refusal is a PASS; a FREE success is a FAIL.
- Showcase accounts (`batch2-review`, `clinic-demo-*`, …) are read only. Writes go to the QA pair, and the scripts
  remove what they can (memory, vet share, smoke notification, sessions).
- Known residue per run: one completed care item on the PAID QA pet, one chat message between the QA pair, one
  replaced pet-photo object in storage, one clinic reminder row on the demo clinic. No pets are created.
- Every script exits non-zero on any FAIL and prints no secrets.
