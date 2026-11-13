# Anonymous help feedback deduplication

Feedback remains anonymous and unauthenticated. The API counts the first vote per published article, UTC day, trusted-proxy client IP and user agent. A PostgreSQL uniqueness constraint and the counter update are applied in one transaction, so simultaneous duplicate requests count once. Duplicate submissions return the same success response. Drafts, unpublished articles and articles in inactive categories remain unavailable.

The database stores only a day-scoped HMAC using the configured session secret; neither IP addresses nor user-agent strings are stored. Rows before yesterday are purged when a valid vote is processed (so a quiet installation retains old pseudonyms until the next vote). An article deletion cascades to its vote claims. The IP is Express `req.ip`, using the existing trusted-proxy configuration; never accept a forwarded address directly from the request. A missing client address fails closed.

This is an abuse reduction, not proof of a unique human: people behind the same IP with the same user agent can share a vote; a determined client changing IP or user agent can evade it. Rotating the session secret resets same-day deduplication. Operational teams should retain appropriate rate limiting and review the proxy trust configuration. Do not log raw identifiers.
