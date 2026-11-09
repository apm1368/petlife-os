-- Enable low-frequency public metadata discovery only. Robots.txt permits general GET access, but this is not
-- a partnership or license: long-form descriptions and source images remain excluded and auto-publishing stays off.
UPDATE "external_travel_sources"
SET
  "allowedHosts" = ARRAY['jajiga.com'],
  "mode" = 'AUTOMATED',
  "automationStatus" = 'SUPPORTED',
  "health" = 'DEGRADED',
  "healthReason" = 'Limited first-page metadata pilot observed; waiting for first successful scheduled sync. Descriptions/images are withheld, date-specific availability is unknown, and results require review.',
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
  "robotsCheckedAt" = '2026-11-08T00:00:00.000Z'::TIMESTAMP(3),
  "robotsResult" = 'HTTP 200; User-agent * Allow /; Disallow /i/* and tracking/query patterns; sitemap public',
  "termsCheckedAt" = '2026-11-08T00:00:00.000Z'::TIMESTAMP(3),
  "termsUrl" = 'https://www.jajiga.com/rules',
  "discoveryNotes" = '{"checkedAt":"2026-11-08","decision":"PL-10 in merged PR #112 selects Jajiga; selection is not reopened","robots":"Public search/listing GETs and robots.txt returned 200; observed paths allowed subject to listed exclusions","publicSearch":"/s?rule[0]=pet returned 3336 source-reported matches and 6 cards in the observed first page","detail":"A candidate room page exposed title/description/one picture; descriptions and images are not copied while reuse terms are unverified","fieldsImported":"source ID, canonical listing URL, title, city, province, maximum guest capacity, public pet-filter marker","notObserved":"date-specific availability/prices, guest/date quote, species-specific rules, reliable complete pagination or nationwide coverage","contentUse":"robots path allowance is not a content license; /rules was an app shell without readable reuse terms and listing footer reserves content; no image/description reuse permission verified","limitation":"First-page discovery is incomplete; omissions never mark a stay removed; daily metadata sync is not live availability; results require review"}'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'JAJIGA';
