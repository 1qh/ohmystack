const CONTROL_ASCII = String.raw`[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]`
const NEWLINES = String.raw`[\n\r\u0085\u2028\u2029]`
const UNICODE_CONTROL = String.raw`[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]`
const RE_CONTROL_ASCII = new RegExp(CONTROL_ASCII, 'gu')
const RE_NEWLINES = new RegExp(NEWLINES, 'gu')
const RE_UNICODE_CONTROL = new RegExp(UNICODE_CONTROL, 'gu')
const RE_HTML_TAGS = /<[^>]*>/gu
const RE_MD_LINK = /\[(?<text>[^\]]*)\]\([^)]*\)/gu
const RE_MD_IMAGE = /!\[(?<alt>[^\]]*)\]\([^)]*\)/gu
const RE_CODE_BLOCK = /```[\s\S]*?```/gu
const RE_INLINE_CODE = /`[^`]*`/gu
const RE_HEADING = /#{1,6}\s/gu
const RE_SHELL_SUBST = /\$[({A-Z_]/gu
const RE_PIPE_SEMI = /[|;]/gu
const sanitizeForDisplay = (text: unknown, max = 4000): string => {
  if (typeof text !== 'string') return ''
  return text
    .replaceAll(RE_CONTROL_ASCII, '')
    .replaceAll(RE_UNICODE_CONTROL, '')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .slice(0, max)
}
const sanitizeExternal = (text: unknown, max = 500): string => {
  if (typeof text !== 'string') return ''
  return text
    .replaceAll(RE_CONTROL_ASCII, '')
    .replaceAll(RE_NEWLINES, ' ')
    .replaceAll(RE_HTML_TAGS, '')
    .replaceAll(RE_UNICODE_CONTROL, '')
    .replaceAll(RE_MD_LINK, '$<text>')
    .replaceAll(RE_MD_IMAGE, '')
    .replaceAll(RE_CODE_BLOCK, '')
    .replaceAll(RE_INLINE_CODE, '')
    .replaceAll(RE_HEADING, '')
    .replaceAll(RE_SHELL_SUBST, '_')
    .replaceAll('`', "'")
    .replaceAll(RE_PIPE_SEMI, ',')
    .slice(0, max)
}
const canonicalizeEmail = (email: string): string => {
  const lower = email.trim().toLowerCase()
  const at = lower.indexOf('@')
  if (at === -1) return lower
  const local = lower.slice(0, at)
  const domain = lower.slice(at + 1)
  const plus = local.indexOf('+')
  const stripped = plus === -1 ? local : local.slice(0, plus)
  const noDots = domain === 'gmail.com' || domain === 'googlemail.com' ? stripped.replaceAll('.', '') : stripped
  return `${noDots}@${domain}`
}
export { canonicalizeEmail, sanitizeExternal, sanitizeForDisplay }
