import { canonicalizeEmail } from './sanitize'
interface ProfileLike {
  email?: unknown
  email_verified?: unknown
}
const parseAllowed = (csv: string | undefined): Set<string> =>
  new Set(
    (csv ?? '')
      .split(',')
      .map(s => canonicalizeEmail(s))
      .filter(Boolean)
  )
const validateProfileEmail = (
  profile: ProfileLike,
  allowed: Set<string>,
  existingEmail: null | string
): { canonicalEmail: string } => {
  const rawEmail = typeof profile.email === 'string' ? profile.email.toLowerCase() : ''
  const canonicalEmail = canonicalizeEmail(rawEmail)
  if (!(canonicalEmail && rawEmail)) throw new Error('Email not allowed')
  if (profile.email_verified === false) throw new Error('Email not verified by provider')
  if (allowed.size === 0) throw new Error('email allowlist not configured — access denied')
  if (!allowed.has(canonicalEmail)) throw new Error('Email not allowed')
  if (existingEmail !== null) {
    const canonicalExisting = canonicalizeEmail(existingEmail)
    if (!canonicalExisting) throw new Error('Existing user missing email — access denied')
    if (!allowed.has(canonicalExisting)) throw new Error('Email not allowed (re-checked)')
    if (canonicalExisting !== canonicalEmail) throw new Error('Email mismatch — existing account vs current sign-in')
  }
  return { canonicalEmail }
}
export type { ProfileLike }
export { parseAllowed, validateProfileEmail }
