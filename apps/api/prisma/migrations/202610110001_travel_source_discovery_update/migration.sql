-- Source discovery re-check 2026-10-11: robots.txt now HTTP 200 and permissive on both (the 2026-10-09 WAF 403 was
-- intermittent). Still no published API/feed; listing and pet data only via undocumented in-page JSON endpoints; no pet
-- filter/landing page confirmed; terms of service not located. Automation needs an owner/legal decision → NOT_SUPPORTED.
UPDATE "external_travel_sources" SET
  "automationStatus" = 'NOT_SUPPORTED', "health" = 'DEGRADED',
  "healthReason" = 'Manual records only: no published API/feed; automated use of undocumented endpoints needs an owner/legal decision',
  "discoveryNotes" = COALESCE("discoveryNotes", '{}'::jsonb) || '{"recheckedAt":"2026-10-11","robotsTxt20261011":"HTTP 200, User-Agent: * with no Disallow","wafBlock":"intermittent (403 on 2026-10-09, 200 on 2026-10-11)","sitemap":"HTTP 410 Gone","petFriendlyFilter":"NOT_CONFIRMED","listingData":"client-rendered; only undocumented JSON endpoints","termsOfService":"NOT_LOCATED","decision":"OWNER_LEGAL_DECISION_REQUIRED"}'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'JABAMA';
UPDATE "external_travel_sources" SET
  "automationStatus" = 'NOT_SUPPORTED', "health" = 'DEGRADED',
  "healthReason" = 'Manual records only: no published API/feed; automated use of undocumented endpoints needs an owner/legal decision',
  "discoveryNotes" = COALESCE("discoveryNotes", '{}'::jsonb) || '{"recheckedAt":"2026-10-11","robotsTxt20261011":"HTTP 200, User-agent: * with no Disallow; Sitemap listed","wafBlock":"intermittent (403 on 2026-10-09, 200 on 2026-10-11)","sitemap":"34 /accommodation category pages (villa/pool/cottage/apartment by city), no pet-friendly page","petFriendlyFilter":"NOT_CONFIRMED","listingData":"client-rendered shell (no listings in HTML, no pet mention); only undocumented JSON endpoints","termsOfService":"NOT_LOCATED","decision":"OWNER_LEGAL_DECISION_REQUIRED"}'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'ALIBABA';
