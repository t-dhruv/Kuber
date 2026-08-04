import { prisma } from './prisma';

// ADR-0003 pairs with this file. Signup marks a User verified immediately when
// no email provider is configured, which unbricks a fresh Instance — but signup
// is otherwise unconditional, so on its own that change would leave an
// internet-exposed Instance open to strangers. Closing open registration once
// the Instance has an owner is what makes it safe.
//
// Invited signup is a separate path and is never gated by this.

/**
 * Whether someone with no invite may create a User and a Household.
 *
 * - `ALLOW_SIGNUP` unset (the default): open only until the first Household
 *   exists. That is exactly long enough for the Self-hoster to claim their own
 *   Instance, and no longer.
 * - `ALLOW_SIGNUP=true`: open permanently, for an Owner who wants to onboard
 *   someone without issuing an invite.
 * - `ALLOW_SIGNUP=false`: closed, including on an empty Instance. `.env.example`
 *   ships the variable empty rather than `false` so that copying it cannot
 *   produce an Instance nobody can claim.
 */
export async function isOpenSignupAllowed(): Promise<boolean> {
  const raw = process.env.ALLOW_SIGNUP?.trim().toLowerCase();
  if (raw !== undefined && raw !== '') {
    return ['true', '1', 'yes', 'on'].includes(raw);
  }
  return (await prisma.household.count()) === 0;
}

/** Shown to someone who hits a closed Instance, and says what to do about it. */
export const REGISTRATION_CLOSED_MESSAGE =
  'Registration is closed on this Instance. Ask the Owner to send you an invite.';
