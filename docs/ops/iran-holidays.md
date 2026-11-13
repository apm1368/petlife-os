# Business calendar: Iranian holidays and closures

Working-hour targets (for example "partner KYC reviewed within 24 working hours", market-readiness Q73) count
Tehran working hours only:

- Saturday–Wednesday 09–17
- Thursday 09–13
- Friday closed

They also skip every closed day in the business calendar.

| Source | Where | Who changes it |
| --- | --- | --- |
| Official public holidays | `apps/api/src/common/time/iran-holidays.data.ts` (generated) | a developer, once a year |
| Closures and openings | table `calendar_day_overrides` | staff with `settings.manage`, in Settings → Holidays and closures, with a reason (audited) |

Nothing at request time calls a third party. `HolidayCalendarService` merges the two sources in memory. It refreshes
every 5 minutes and right after an edit.

Read-only users:

- the KYC SLA (`businessHoursBetween(…, closedDays())`)
- `GET /calendar/closed-days?from=YYYY-MM-DD&to=YYYY-MM-DD` (public, at most 400 days, cached 15 min), for bookings
  (clinic closed days) and delivery estimates when they adopt it

## Yearly refresh

The official calendar for the next Persian year is usually published in the autumn (Aban–Azar). After that:

```bash
cd apps/api && node scripts/fetch-iran-holidays.mjs 1406 1407 --provisional 1407
```

- Source: holidayapi.ir, which answers one day per request (about 8 s each). It is reachable from the VPS (checked
  2026-11-12); a year takes a few minutes.
- What is skipped: Fridays are left out because they are always closed. A holiday that falls on a Friday is kept.
- Provisional years: mark a year `--provisional` while its lunar holidays are only estimated. The admin page shows a
  warning for such years, and staff correct any day that moves.
- After running it, commit the regenerated data file. The spec in `business-hours.spec.ts` checks that every
  row's Persian date matches its Gregorian date.
- New holiday names: if the list gains a name the admin can't translate, the web test "maps every official name"
  fails. Add the phrase to `apps/web/features/admin-calendar/holiday-names.ts` and the name to
  `adminHolidays.names` in en/de/es.
