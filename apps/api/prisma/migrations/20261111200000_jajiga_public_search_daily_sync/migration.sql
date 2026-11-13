-- PL-03/PL-10 (owner, 2026-11-11): show Jajiga's pet-permitted stays daily and send members to the exact Jajiga listing.
-- The first-page HTML only server-renders one card; the full list comes from the public JSON search the Jajiga site
-- itself calls without login (api.jajiga.com/api/search?rules[]=pet, robots "Allow: /"). A daily run walks all
-- result pages one request at a time (2.5–4 s apart, ~160 requests). Only factual card fields and a dated nightly
-- "from" price are kept; descriptions, images, host identity and coordinates are not copied. Explicitly marked
-- pet-friendly cards are published automatically; staff can still hide any listing. Not a partnership or licence.
UPDATE "external_travel_sources"
SET
  "sourceType" = 'UNOFFICIAL_PUBLIC_WEB_ENDPOINT',
  "mode" = 'AUTOMATED',
  "automationStatus" = 'SUPPORTED',
  "accessStatus" = 'VERIFIED_PUBLIC',
  "health" = 'DEGRADED',
  "healthReason" = 'Switched to the public JSON search (all result pages); waiting for the first successful scheduled sync.',
  "autoPublish" = true,
  "imagePolicy" = 'NO_IMAGES',
  "maxRequestsPerRun" = 200,
  "syncIntervalMinutes" = 1440,
  "metadataTtlMinutes" = 2880,
  "priceTtlMinutes" = 1440,
  "requestDelayMinMs" = 2500,
  "requestDelayMaxMs" = 4000,
  "consecutiveFailures" = 0,
  "circuitOpenUntil" = NULL,
  -- Due immediately: the worker (10-minute tick) starts the first full sync right after deploy, then daily.
  "lastRunAt" = NULL,
  "lastErrorCategory" = NULL,
  "lastError" = NULL,
  "robotsCheckedAt" = '2026-11-11T00:00:00.000Z'::TIMESTAMP(3),
  "robotsResult" = 'www.jajiga.com: Allow /; Disallow /i/*, *gstnum*, *utm_*. api.jajiga.com: User-agent * Allow /',
  "discoveryNotes" = '{"checkedAt":"2026-11-11","decision":"PL-03/PL-10: owner asked on 2026-11-11 to show Jajiga pet-permitted stays daily with an outbound link to the exact Jajiga listing","strategy":"UNOFFICIAL_PUBLIC_WEB_ENDPOINT: GET https://api.jajiga.com/api/search?perPage=18&rules[]=pet&page=N (the endpoint jajiga.com calls in a public browser session; no login, cookie, token or proof-of-work)","observed":"filters.rules=[pet]; rooms.pagination total 2831-2832, 18 per page, page 158 short, page 159 empty; every card carried is_pet_friendly","previousFailure":"2026-11-09..11 scheduled runs failed MALFORMED: the first-page HTML server-renders 1 card and 5 empty placeholders","fieldsImported":"source ID, canonical /room/{id} URL, title, city, province, max guests, bedrooms, rating and review count, instant-booking marker, nightly from-price (toman x10 = IRR) with observation time, pet marker","notImported":"descriptions, pictures, host identity, coordinates, date-specific availability/quotes, species-specific pet rules","termsNote":"jajiga.com/rules article 10 (observed 2026-11-10) restricts extraction/reuse of platform data without written permission; no written permission is on file. Enabled on the owner instruction of 2026-11-11 with factual metadata and outbound links only; pause the source if Jajiga objects","boundaries":"one request at a time, 2.5-4 s spacing, honest User-Agent, robots checked each run; 403/CAPTCHA/429 stop the run and open the circuit with no bypass"}'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'JAJIGA';
