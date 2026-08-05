# Configuring email

Email is optional. Kuber runs without it, and a fresh Instance is deliberately
usable before you configure any of this.

Configure it when you want password resets, Household invites that arrive by
themselves, email-based multi-factor authentication, or notifications.

## What changes once you configure a provider

This is the part worth understanding before you turn it on.

With **no provider configured**, signup marks the new User verified immediately.
There is no transport, so a verification message would never arrive, and
requiring it would lock the Self-hoster out of their own Instance permanently
([ADR-0003](../adr/0003-email-verification-is-skipped-when-no-provider-is-configured.md)).

With **a provider configured**, signup sends a verification link and login
refuses the User until they follow it. Existing Users who were verified under
the earlier configuration stay verified — turning email on does not lock out
your Household.

The consequence to plan for: configure email *before* inviting anyone else, or
your Members' invitations will be the first thing that depends on a transport
you have not tested.

## Option 1 — Resend

The simpler option. Create an API key at [resend.com](https://resend.com), verify
your sending domain there, then in `.env`:

```bash
RESEND_API_KEY=re_your_api_key_here
RESEND_FROM=Kuber <kuber@yourdomain.com>
```

`RESEND_FROM` must use a domain you have verified with Resend, or every send is
rejected.

## Option 2 — SMTP

Any SMTP server works. In `.env`:

```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=kuber@yourdomain.com
SMTP_PASS=your_smtp_password
SMTP_FROM=Kuber <kuber@yourdomain.com>
```

Port 587 uses STARTTLS. Use 465 if your provider requires implicit TLS.

For Gmail, `SMTP_PASS` must be an
[App Password](https://support.google.com/accounts/answer/185833) — your normal
password will not authenticate.

If both Resend and SMTP are configured, Resend is used.

## Apply and verify

```bash
docker compose -f docker-compose.prod.yml up -d
```

Confirm the server picked up the provider — with none configured it logs that it
is skipping sends:

```bash
docker compose -f docker-compose.prod.yml logs server | grep -i mail
```

Then test the path a real User will take. Use the password reset form rather
than signup, since signup is closed once your Household exists:

1. Sign out, and choose **Forgot password**.
2. Enter your own address.
3. Confirm the message arrives.

If nothing arrives, check the server logs first — an authentication failure or a
rejected `From` domain is reported there:

```bash
docker compose -f docker-compose.prod.yml logs --tail=50 server
```

Then check the spam folder, and confirm your sending domain's SPF and DKIM
records are published. Self-hosted mail without them is usually filtered
silently.

## Turning email off again

Clear the provider variables and restart:

```bash
sed -i 's/^RESEND_API_KEY=.*/RESEND_API_KEY=/' .env
sed -i 's/^SMTP_HOST=.*/SMTP_HOST=/' .env
docker compose -f docker-compose.prod.yml up -d
```

Users already verified stay verified. New signups are marked verified on
creation again.
