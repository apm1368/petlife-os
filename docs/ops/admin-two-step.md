# Admin two-step sign-in (TOTP)

Market-readiness Q75. Admin pages can require a 6-digit code from an authenticator app (RFC 6238: HMAC-SHA1,
30-second steps), on top of the normal sign-in. Consumer, seller and provider pages are not affected.

## Opt-in for now (owner, 2026-11-13)

Every admin can turn two-step sign-in on for their own account. Requiring it for the whole team stays off until SMS and
email delivery are live: the server setting `ADMIN_TWO_STEP_ENFORCEMENT` defaults to `off`. While it is off,
`/admin/access/two-step` cannot switch enforcement on (`TWO_STEP_ENFORCEMENT_NOT_AVAILABLE`), and no stored policy
row can lock anyone out. Set it to `on` in `apps/api/.env` and reload the API only when the owner decides.

## How it behaves

| State | What the admin sees |
| --- | --- |
| Not enrolled, not enforced | Everything works; a dismissable reminder above admin pages. |
| Not enrolled, enforced, inside grace | Everything works; a reminder with the deadline. |
| Not enrolled, enforced, grace over | Only the "turn on two-step sign-in" screen until enrolled. |
| Enrolled | A code once per sign-in, and again every 12 hours. |

- **Enrol:** `/admin/two-step`. Type the setup key into the app ("Add account → Enter a setup key"), or use "Open in
  authenticator app" on the phone itself. Two-step only switches on after one valid code. You then get 10
  single-use recovery codes, shown once and stored only as hashes.
- **Codes:** the previous, current and next 30-second step are accepted, and each step only once (no replay).
  Five wrong codes in a row lock the check for 15 minutes; the lock is audited.
- **Team policy:** `/admin/access/two-step`.
  - Who can change it: only a SUPER_ADMIN (`admin.manage`), and only after enrolling their own account.
  - Grace window: 0–30 days, counted from enforcement or from the admin joining, whichever is later.
  - Every change needs a reason and is audited.
- **Lost phone:** the admin signs in with a recovery code. If those are gone too, a SUPER_ADMIN uses **Reset** on
  `/admin/access/two-step`; that needs a reason and is audited. The admin then enrols again.
  - Nobody can reset their own two-step sign-in.
  - Nobody can turn it off while it is enforced.
- **SMS fallback:** deliberately not offered until real SMS delivery is live.

## Keys

TOTP secrets are sealed with AES-256-GCM.

- **Which key:** `ADMIN_TWO_STEP_KEY` if it is set (at least 32 characters), otherwise a key derived from
  `SESSION_SECRET`. Decide once, before admins enrol.
- **Changing the key:** rotating whichever key is in use makes every enrolled authenticator unreadable. The API then
  answers `TWO_STEP_KEY_CHANGED`, and the affected admins use a recovery code or get reset.

## Break-glass

If every SUPER_ADMIN is locked out (lost phones and recovery codes), the server operator can delete that account's
row with database access:

```sql
DELETE FROM admin_two_step_factors WHERE "userId" = '<user id>';
```

The recovery codes go with it. Enforcement can be switched off the same way:

```sql
UPDATE admin_two_step_policy SET "enforcedAt" = NULL;
```

Record why in the ops log.
