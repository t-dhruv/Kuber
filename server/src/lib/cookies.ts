import { logger } from './logger.js';

// ADR-0002. The refresh cookie's `Secure` flag used to be derived from
// NODE_ENV === 'production', which .env.example ships. Browsers discard Secure
// cookies over plain HTTP, exempting only localhost, so a Self-hoster reaching
// their Instance at a LAN address logged in successfully and then lost the
// session the moment the access token expired — silently, with nothing in any
// log to explain it.
//
// COOKIE_SECURE now says so explicitly.

/**
 * Whether the refresh cookie carries `Secure`.
 *
 * Defaults to enabled: the safe configuration is the one an operator gets
 * without thinking about it. Only an explicit, recognised falsy value turns it
 * off, so a typo fails towards security rather than away from it.
 *
 * Read per call rather than captured at import, so a test can set the variable
 * around a request without re-importing the module graph.
 */
export function isCookieSecure(): boolean {
  const raw = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (raw === undefined || raw === '') return true;
  return !['false', '0', 'no', 'off'].includes(raw);
}

/**
 * Warns at boot when secure cookies are off, so the operator understands the
 * trade-off they have accepted rather than discovering it in a packet capture.
 *
 * Called from the entry point; `createApp()` stays free of side effects.
 */
export function warnIfCookiesInsecure(): void {
  if (isCookieSecure()) return;
  logger.warn(
    'COOKIE_SECURE is disabled: the refresh cookie will be sent over plain HTTP and is ' +
      'interceptable on your network. This is supported for trusted LAN Instances without TLS. ' +
      'Put Kuber behind HTTPS and unset COOKIE_SECURE if the Instance is reachable from the internet.',
  );
}
