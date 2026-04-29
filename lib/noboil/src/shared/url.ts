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
interface SourceEntry {
  domain: string
  title: string
  url: string
}
const WWW_RE = /^www\./u
const isSafeUrl = (url: string): boolean => {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}
const extractDomain = (url: string): string => {
  try {
    return new URL(url).hostname.replace(WWW_RE, '')
  } catch {
    return url
  }
}
const toSourceEntry = (raw: unknown): null | SourceEntry => {
  if (!raw || typeof raw !== 'object') return null
  const url = 'url' in raw && typeof raw.url === 'string' ? raw.url : ''
  if (!(url && isSafeUrl(url))) return null
  const title = 'title' in raw && typeof raw.title === 'string' ? raw.title : url
  return { domain: extractDomain(url), title, url }
}
const extractSources = (content: unknown): SourceEntry[] => {
  if (!Array.isArray(content)) return []
  const out: SourceEntry[] = []
  for (const item of content) {
    const entry = toSourceEntry(item)
    if (entry) out.push(entry)
  }
  return out
}
export type { RedirectInputs, SourceEntry }
export { extractDomain, extractSources, isSafeUrl, normalizeOrigin, parseSiteUrls, validateRedirectTo }
