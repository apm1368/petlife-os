# Provider and seller shell visual rollout — 2026-11-09

## Scope

This slice aligns the shared operational navigation used by provider and seller
workspaces. It improves active-route visibility, touch targets and reduced
motion behavior without changing role checks, verification gates, routes or
business operations.

| Reference          | Routes/components                                                         | Status                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `reference-09.png` | `/[locale]/provider/*`, `/[locale]/seller/*`; shared `operator-shell.css` | Header and horizontal navigation use shared geometry, semantic active-state tokens and minimum 44px links.                   |
| `reference-15.png` | Provider and seller navigation states                                     | Focus treatment and reduced-motion behavior remain accessible; page-level tables, filters and action queues are not covered. |

The reference board includes illustrative organization, patient and financial
records. None were copied into application data.

## Decisions and boundaries

Relevant codes: DS-01, DS-03, DS-06, DS-07, DS-10, DS-14, DS-16, GC-10,
VT-01..VT-20 and PL-11.

The existing operator shell is reused for provider and seller. The active
navigation state has both a border and a labeled current-page semantic; the
design does not depend on color alone. The mobile shell remains horizontally
scrollable and preserves the existing route set. Operational workspaces are
not considered visually complete from this navigation-only change.

## Verification and limitations

- Run provider-shell and seller-shell consumer regression tests, web typecheck,
  lint and `git diff --check` on the PR head.
- Rendered screenshots and browser interaction checks are still required for
  light/dark, fa/en/de/es, mobile/tablet/desktop and simplified mode. No such
  browser runner is available in this environment; production build is blocked
  by low available disk space.
- Next operational slices must cover patient queue, clinical visit, seller
  catalog, inventory, orders, finance tables and role-restricted actions.
