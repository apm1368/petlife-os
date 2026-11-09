# Health and care visual rollout — 2026-11-09

## Scope

This slice refines the shared health frame, member health overview and care
calendar. It changes presentation only; no clinical values, permissions,
reminder scheduling or API behavior changed.

| Reference          | Routes/components                                                                                                        | Status                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `reference-08.png` | `/[locale]/pets/[id]/health`, `/[locale]/pets/[id]/care`, `/[locale]/pets/[id]/care/calendar`, `/[locale]/care-calendar` | Health overview panels use the shared card/surface tokens. Calendar agenda, month controls and touch targets use token spacing and geometry. |
| `reference-15.png` | Health/care shared states                                                                                                | Existing real loading, empty, error, permission and offline behavior is preserved; visual RTL/LTR screenshot checks remain pending.          |
| `reference-09.png` | Provider/clinical workspace                                                                                              | Reviewed as the next operational family; no provider/clinical route is changed in this slice.                                                |

No example pet, medical record, measurement, price or appointment from a board
was added to the application.

## Decisions

Relevant codes: DS-01, DS-03, DS-05, DS-06, DS-07, DS-09, DS-10, DS-14,
GC-09, GC-10, GC-12, V-06, V-09, V-12, PT-01, PT-09, PT-17, PT-20,
VT-01 and VT-02.

The existing shared `HealthCareFrame` and semantic tokens are reused. Health
states keep their text labels; colors do not replace known/unknown or
attention semantics. Calendar spacing uses logical properties, and the
mobile calendar date target now meets the shared minimum touch target.
Unverified/unknown health values remain unchanged.

Open PRs #121, #136 and #137 alter care/calendar copy or locale behavior but
not this stylesheet. This branch is independent from those branches and
their final diff still needs to be checked after integration.

## Verification and limitations

- Run focused `HealthOverviewView`, `PetCareCalendarView`, `CareCenterView`
  and related tests on the PR head.
- Run web typecheck and `git diff --check`.
- This environment has no browser screenshot runner; no before/after
  screenshots are claimed. Disk space is very low, so a production build is
  blocked until safe capacity is available.
- Do not mark health/care visually complete until actual pages have been
  inspected at mobile/tablet/desktop in light/dark, fa/en/de/es and simplified
  mode, including long labels and error/forbidden/empty states.
