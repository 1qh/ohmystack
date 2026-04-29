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
export { normalizeOrigin, parseSiteUrls }
