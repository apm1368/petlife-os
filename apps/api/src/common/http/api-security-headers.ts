import helmet from "helmet";

/**
 * The public API is served under the canonical HTTPS origin behind the
 * production edge, which owns HSTS for the whole site. Disabling Helmet's
 * duplicate HSTS avoids two Strict-Transport-Security values on /api routes;
 * every other Helmet protection remains enabled.
 */
export const apiSecurityHeaders = helmet({ strictTransportSecurity: false });
