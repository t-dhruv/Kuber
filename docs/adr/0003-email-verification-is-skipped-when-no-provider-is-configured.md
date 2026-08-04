# Email verification is skipped when no email provider is configured

Signup unconditionally created an email-verification token and blocked login until the
address was verified. SMTP and Resend are both optional, and `sendMail` logs
`No email provider configured — skipping send` and returns normally when neither is set.
The result was that every fresh Instance bricked itself: the first User signed up, was
told to check their email, no email was ever sent, and login returned 403 forever. The
only recovery was `UPDATE users SET email_verified_at = now()` via psql. There was no
first-user exemption, admin override, or CLI.

Signup now marks `emailVerifiedAt` immediately when no email provider is configured.
Verification behaviour is unchanged when a provider *is* configured.

## Consequences

This looks like a security hole on first read, and it is not: verification proves control
of an address via a message that, without a transport, is never sent. Gating login on an
unsendable message protects nothing and locks out the legitimate operator. **Do not
"fix" this by restoring the unconditional block** — that reintroduces the brick. If
verification must always apply, an email provider has to become required configuration,
which is a different and larger decision.

Signup is separately gated by `ALLOW_SIGNUP`, which closes registration once the first
Household exists, so this does not leave open registration on an internet-exposed
Instance.
