const normalizeOrigin = (u: string): string => {
  try {
    return new URL(u).origin.toLowerCase()
  } catch {
    return ''
  }
}
const parseSiteUrls = (csv: string | undefined): { allowedOrigins: Set<string>; primary: string; siteUrls: string[] } => {
  const siteUrls = (csv ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  return {
    allowedOrigins: new Set(siteUrls.map(normalizeOrigin).filter(Boolean)),
    primary: siteUrls[0] ?? '',
    siteUrls
  }
}
const ENCODED_TRAVERSAL = ['\\', '%2f%2f', '%5c', '%09', '%0a', '%0d']
interface RedirectInputs {
  allowedOrigins: Set<string>
  primarySite: string
  redirectTo: unknown
}
const validateRedirectTo = ({ allowedOrigins, primarySite, redirectTo }: RedirectInputs): string => {
  if (typeof redirectTo !== 'string') throw new Error(`Expected string redirectTo, got ${typeof redirectTo}`)
  const pathOnly = redirectTo.split('?')[0]?.split('#')[0] ?? ''
  const loweredPath = pathOnly.toLowerCase()
  for (const banned of ENCODED_TRAVERSAL)
    if (loweredPath.includes(banned)) throw new Error('redirectTo contains disallowed encoded chars')
  if (redirectTo.startsWith('//') || redirectTo.startsWith('/\\'))
    throw new Error('redirectTo protocol-relative path not allowed')
  if (redirectTo.startsWith('/')) {
    let resolved: string
    try {
      resolved = new URL(redirectTo, primarySite).origin
    } catch (parseError) {
      throw new Error('redirectTo path parse failed', { cause: parseError })
    }
    if (resolved.toLowerCase() !== normalizeOrigin(primarySite))
      throw new Error('redirectTo path resolves to foreign origin')
    return `${primarySite}${redirectTo}`
  }
  let parsed: URL
  try {
    parsed = new URL(redirectTo)
  } catch (parseError) {
    throw new Error('Invalid redirectTo URL', { cause: parseError })
  }
  if (!allowedOrigins.has(parsed.origin.toLowerCase())) throw new Error('redirectTo origin not allowed')
  return `${parsed.origin}${parsed.pathname}${parsed.search}`
}
export type { RedirectInputs }
export { normalizeOrigin, parseSiteUrls, validateRedirectTo }
