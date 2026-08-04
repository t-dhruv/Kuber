import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '../../src/lib/logger';
import { isCookieSecure, warnIfCookiesInsecure } from '../../src/lib/cookies';

// ADR-0002. The Set-Cookie attributes themselves are proven against a real
// request in tests/db/cookieSecure.test.ts. What is left here is the parsing —
// which values disable the flag — and the boot warning, whose only observable
// is the log line.

const original = process.env.COOKIE_SECURE;

beforeEach(() => {
  delete process.env.COOKIE_SECURE;
});

afterEach(() => {
  vi.restoreAllMocks();
  if (original === undefined) delete process.env.COOKIE_SECURE;
  else process.env.COOKIE_SECURE = original;
});

describe('isCookieSecure', () => {
  it('defaults to enabled when unset or empty', () => {
    expect(isCookieSecure()).toBe(true);
    process.env.COOKIE_SECURE = '';
    expect(isCookieSecure()).toBe(true);
    process.env.COOKIE_SECURE = '   ';
    expect(isCookieSecure()).toBe(true);
  });

  it('is disabled only by an explicit, recognised falsy value', () => {
    for (const value of ['false', 'FALSE', '0', 'no', 'off', ' False ']) {
      process.env.COOKIE_SECURE = value;
      expect(isCookieSecure(), value).toBe(false);
    }
  });

  it('stays enabled on a value it does not recognise, so a typo fails safe', () => {
    for (const value of ['flase', 'disabled', 'nope', 'true']) {
      process.env.COOKIE_SECURE = value;
      expect(isCookieSecure(), value).toBe(true);
    }
  });
});

describe('warnIfCookiesInsecure', () => {
  it('warns when secure cookies are disabled', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    process.env.COOKIE_SECURE = 'false';

    warnIfCookiesInsecure();

    expect(warn).toHaveBeenCalledOnce();
    // The Self-hoster has to be able to act on this: it must name the setting
    // and say what the exposure actually is.
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('COOKIE_SECURE');
    expect(message).toMatch(/plain HTTP/i);
  });

  it('stays quiet on the default configuration', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

    warnIfCookiesInsecure();

    expect(warn).not.toHaveBeenCalled();
  });
});
