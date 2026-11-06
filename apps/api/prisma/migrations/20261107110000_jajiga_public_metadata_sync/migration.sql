-- Enable low-frequency public metadata discovery only. Robots.txt permits general GET access, but this is not
-- a partnership or license: long-form descriptions and source images remain excluded and auto-publishing stays off.
UPDATE "external_travel_sources"
SET
  "allowedHosts" = ARRAY['jajiga.com'],
  "mode" = 'AUTOMATED',
  "automationStatus" = 'SUPPORTED',
  "health" = 'HEALTHY',
  "healthReason" = 'Public pet-filter search observed; first page only, factual metadata only; descriptions and image reuse rights unverified',
  "sourceType" = 'SCRAPED_PUBLIC_WEB',
  "accessStatus" = 'VERIFIED_PUBLIC',
  "syncIntervalMinutes" = 1440,
  "metadataTtlMinutes" = 1440,
  "priceTtlMinutes" = 1440,
  "imagePolicy" = 'NO_IMAGES',
  "maxRequestsPerRun" = 12,
  "timeoutMs" = 10000,
  "retryCount" = 1,
  "autoPublish" = false,
  "cityScopes" = ARRAY[]::TEXT[],
  "requestDelayMinMs" = 2500,
  "requestDelayMaxMs" = 4000,
  "robotsCheckedAt" = '2026-11-06T00:00:00.000Z'::TIMESTAMP(3),
  "robotsResult" = 'HTTP 200; User-agent * Allow /; Disallow /i/* and tracking/query patterns; sitemap public',
  "termsCheckedAt" = '2026-11-06T00:00:00.000Z'::TIMESTAMP(3),
  "termsUrl" = 'https://www.jajiga.com/rules',
  "discoveryNotes" = '{"checkedAt":"2026-11-06","decision":"PL-10 in open PR #112 selects Jajiga; adopted without reopening comparison","robots":"HTTP 200; Allow /; Disallow /i/*, gstnum and utm patterns","publicSearch":"/s?rule[0]=pet returned 3323 source-reported matches and 6 cards in the observed first page","detail":"Observed listing page includes title and description fields; description not copied until reuse terms verified","fieldsImported":"source ID, canonical listing URL, title, city, province, maximum guest capacity, public pet-filter marker","notObserved":"date-specific availability, guest/date quote, specific pet rules, reliable complete pagination","contentUse":"robots permits crawl path but does not grant content license; /rules response was app shell without readable terms and footer reserves site content; no image reuse permission verified; no descriptions/images copied","limitation":"First-page discovery is incomplete; omissions never mark a stay removed; PET LIFE does not claim live availability"}'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'JAJIGA';
