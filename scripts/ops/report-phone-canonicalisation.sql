-- Phone E.164 canonicalisation REPORT (read-only; nothing is rewritten).
-- The API now stores, looks up and rate-limits phones only in E.164 (+989XXXXXXXXX). Rows written before that
-- change may hold another spelling (0912…, 912…, 0098…, Persian digits) and would no longer match a sign-in.
-- This lists them, their canonical form, and any collision (two accounts that are really one number).
-- Accounts are never merged automatically; the owner decides.
--   docker exec -i petlife-os-postgres-1 psql -U petlife -d petlife_os < scripts/ops/report-phone-canonicalisation.sql

CREATE TEMP VIEW phone_canon AS
SELECT id, phone,
  CASE
    WHEN p ~ '^09[0-9]{9}$'      THEN '+98' || substr(p, 2)
    WHEN p ~ '^9[0-9]{9}$'       THEN '+98' || p
    WHEN p ~ '^\+989[0-9]{9}$'   THEN p
    WHEN p ~ '^00989[0-9]{9}$'   THEN '+' || substr(p, 3)
  END AS canonical
FROM (
  SELECT id, phone,
    regexp_replace(translate(phone, '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'), '[\s()-]', '', 'g') AS p
  FROM users WHERE phone IS NOT NULL
) s;

\echo '== users.phone not already canonical (canonical = NULL means not a valid Iranian mobile)'
SELECT id, phone, canonical FROM phone_canon WHERE canonical IS DISTINCT FROM phone ORDER BY id;

\echo '== collisions: one canonical number held by more than one account'
SELECT canonical, count(*) AS accounts, array_agg(id) AS user_ids
FROM phone_canon WHERE canonical IS NOT NULL GROUP BY canonical HAVING count(*) > 1;

\echo '== pending household invitations to a phone not in canonical form'
SELECT id, contact FROM household_invitations
WHERE status = 'PENDING' AND contact NOT LIKE '%@%' AND contact !~ '^\+989[0-9]{9}$';
