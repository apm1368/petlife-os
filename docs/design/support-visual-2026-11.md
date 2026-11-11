# Support visual rollout — 2026-11-09

## Scope

This slice aligns the authenticated support center and ticket thread with the
shared visual tokens and reference patterns. It does not change ticket
permissions, escalation, status transitions, attachments or service behavior.

| Reference          | Routes/components                                                                                | Status                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `reference-07.png` | `/[locale]/support`, `/support/new`, `/support/tickets`, `/support/tickets/[id]`; `SupportFrame` | Tokenized case rows, thread/summary surfaces, focus, spacing and touch target styling. |
| `reference-15.png` | Support loading/error/empty/access states                                                        | Existing API-backed states are retained; live browser checks are pending.              |

The board's example tickets and messages are illustrative. No sample ticket or
user message was copied into real or seeded application content.

## Decisions and boundaries

Relevant codes: AD-04, AD-05, AD-07..AD-11, DS-01, DS-03, DS-05, DS-06,
DS-07, DS-10, DS-14 and GC-10.

The existing `SupportFrame`, shared UI primitives, route behavior and
application-owned translations are reused. User-entered ticket subjects and
messages remain unaltered. The public Help Center/legal pages, shelter and
animal-support operational pages are not part of this visual slice.

## Verification and limitations

- Run support home, create-ticket, ticket-list and thread tests plus web
  typecheck, lint and `git diff --check` on the PR head.
- Browser screenshots are required before visual completion: light/dark,
  fa/en/de/es, RTL/LTR and mobile/tablet/desktop. Playwright and Chromium are
  available, but no local PR preview was started because disk space is low.
  The only screenshot in this batch is a production landing reference, not a
  support-page capture.
- The current change is an implementation slice, not evidence of full visual
  or localization coverage and not live-verified.
