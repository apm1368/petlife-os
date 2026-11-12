-- Jajiga daily sync, 2026-11-12: the first run (2026-11-11) stopped after 131 of 158 result pages while the box was
-- under build load, and passed as SUCCEEDED. The engine now reports such a run as PARTIAL (DISCOVERY_INCOMPLETE) and the
-- adapter asks for a timed-out page again after a pause. A 20 s timeout and a 300-request budget leave room for those
-- retries (158 pages today, ~2.5–4 s apart); 403/429 still stop the run and are never retried.
UPDATE "external_travel_sources"
SET
  "timeoutMs" = 20000,
  "maxRequestsPerRun" = 300
WHERE "code" = 'JAJIGA';
