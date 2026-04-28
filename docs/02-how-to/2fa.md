# How-to: Enable Two-Factor Authentication (2FA)

## Goal
Add an extra layer of security to your Kuber account using TOTP (Time-based One-Time Password) with any authenticator app.

## What You'll Need

- An authenticator app on your phone:
  - Google Authenticator
  - Authy
  - Bitwarden Authenticator
  - Any TOTP-compatible app
- Your phone (obviously)

---

## Steps

### 1. Go to Security Settings

1. Log in to Kuber
2. Click your **avatar** (top right) → **Settings**
3. Click **Security** in the settings sidebar
4. Find the **Two-Factor Authentication** section

### 2. Set Up 2FA

1. Click **Enable Two-Factor Authentication**
2. A QR code appears on screen
3. Open your authenticator app on your phone
4. Tap **+** or **Add Account**
5. Scan the QR code

### 3. Verify the Setup

1. The app will start generating 6-digit codes (they change every 30 seconds)
2. Type the **current 6-digit code** from your app into Kuber's verification field
3. Click **Verify**

### 4. Save Your Backup Codes

After verification, Kuber shows **backup codes**:

1. **Copy all the codes** and save them somewhere safe (password manager, written down, etc.)
2. Each code can be used **once** if you lose access to your authenticator app
3. Click **Done**

---

## Logging In with 2FA

From now on, logging in requires:

1. Enter your email and password → **Sign In**
2. The page asks for your **6-digit code**
3. Open your authenticator app → find Kuber
4. Type the current code → **Verify**

---

## If You Lose Your Phone

Use one of your **backup codes**:

1. On the 2FA prompt, click **Use Backup Code**
2. Enter one of your saved backup codes
3. You're logged in!

> **Important:** Each backup code works only once. After using one, cross it off your list.

---

## Disable 2FA (If Needed)

1. Go to **Settings → Security → Two-Factor Authentication**
2. Click **Disable**
3. Confirm — you'll need to enter your current 2FA code to disable

---

## Confirmation

- 2FA status shows as **Enabled** in Security settings
- Login requires a 6-digit code from your authenticator app
- Backup codes are saved somewhere safe

## Troubleshooting

| Problem | Solution |
|----------|----------|
| **QR code won't scan** | Try typing the secret key manually in your authenticator app (click "Show Secret Key" in Kuber). |
| **"Invalid code" error** | Ensure your phone's time is correct (authenticator codes depend on accurate time). Enable "Set Automatically" in phone Date & Time settings. |
| **Lost phone + no backup codes** | You'll need the household owner to disable 2FA for your account from the admin settings, or restore from a backup. |
| **Backup codes not showing** | Ensure you completed the verification step. Backup codes only appear after successful verification. |
