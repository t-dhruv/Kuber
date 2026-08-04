# The refresh cookie's Secure flag is configurable

The refresh cookie was set with `secure: process.env.NODE_ENV === 'production'`, and
`.env.example` ships `NODE_ENV=production`. Browsers discard `Secure` cookies over plain
HTTP, exempting only `localhost`. So a self-hoster reaching their Instance at
`http://192.168.1.50` lost the refresh cookie silently: login appeared to succeed, then
the session died fifteen minutes later when the access token expired, with nothing in any
log to explain it.

`COOKIE_SECURE` now controls the flag explicitly. It defaults to `true`, and the server
logs a warning at boot when it is disabled.

## Consequences

Kuber ships a documented way to run without TLS, which is a real reduction in security —
a refresh token traversing a plain-HTTP LAN is interceptable. This is deliberate. The
alternative was not "everyone uses HTTPS", it was "LAN self-hosters hit an unexplainable
login loop". **Do not "harden" this back to an unconditional `true`** without providing a
working TLS story for LAN installs first.
