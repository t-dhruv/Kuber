# Multi-factor authentication

Kuber offers two second factors, under **Settings → Security**. You can run
either, or both.

- **Two-Factor Authentication** — a six-digit code from an authenticator app
  (TOTP). Works with no email provider configured, and works offline.
- **Email Code** — a one-time code sent to your address. Requires a working
  email provider; see [configuring email](email.md).

If your Instance has no email provider — the common self-hosted case — use TOTP.
Email Code has no way to reach you.

## Enable an authenticator app

1. Go to **Settings → Security** and start setup on the Two-Factor
   Authentication card.
2. Scan the QR code with your authenticator app. If you cannot scan it, the key
   is shown beneath and can be typed in by hand.
3. Click **Next**.
4. Enter the six-digit code your app is showing and click **Verify & Enable**.
   The code rotates every thirty seconds; if it is rejected, wait for the next
   one and check your phone's clock is accurate — TOTP is time-based, and a
   drifted clock produces codes the server will not accept.

### Save your backup codes

Kuber then shows a set of one-time backup codes. **This is the only time they are
shown.**

Copy them and store them somewhere that is not the device holding your
authenticator app, and not only inside Kuber — if you are locked out of Kuber,
anything stored inside it is unreachable. Each code works once.

Click **Done** when they are saved.

## Enable Email Code

On the Email Code card, confirm with your password. From then on, login sends a
code to your address.

This depends on outbound email working. Test that password reset email arrives
before you rely on it.

## Signing in afterwards

After your password, Kuber asks for a code. Supply one from your authenticator
app, or one of your backup codes.

## Turning it off

Disabling either factor requires your password. Turning off TOTP invalidates the
backup codes issued with it; enabling it again produces a fresh set.

## If you are locked out

**You have a backup code** — use it in place of the authenticator code, then set
2FA up again from a device you control.

**You are an Owner and a Member is locked out** — you can reset that Member's 2FA
from **Settings → Household**. See [Household management](household.md).

**You are the only Owner, with no backup codes** — there is no recovery path in
the UI, by design: an Instance where the Self-hoster can bypass the second factor
from outside does not have one. Recovery means database access on the host,
clearing the MFA columns on your User row. That is why the backup codes matter.

## Verify

- The Security page shows the factor as enabled.
- Signing out and back in asks for a code.
- One backup code is accepted in place of the app code, and is refused the
  second time you try it.
