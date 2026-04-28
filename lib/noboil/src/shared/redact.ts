const SK_ANT_RE = /sk-ant-[A-Za-z0-9_-]{8,}/gu
const E2B_KEY_RE = /\be2b_[A-Za-z0-9_-]{8,}/gu
const JWT_RE = /eyJ[A-Za-z0-9._-]{20,}/gu
const PROXY_TOKEN_RE = /proxy:[a-z0-9]+:[a-f0-9-]{36}/giu
const OPENAI_KEY_RE = /\bsk-[A-Za-z0-9_-]{20,}/gu
const AWS_ACCESS_KEY_RE = /\bAKIA[0-9A-Z]{16}\b/gu
const GITHUB_TOKEN_RE = /\bgh[opsu]_[A-Za-z0-9]{36,}/gu
const GOOGLE_KEY_RE = /\bAIza[0-9A-Za-z_-]{35}\b/gu
const COMBINED_RE = new RegExp(
  [
    'sk-ant-[A-Za-z0-9_-]{8,}',
    'eyJ[A-Za-z0-9._-]{20,}',
    'proxy:[a-z0-9]+:[a-f0-9-]{36}',
    String.raw`\be2b_[A-Za-z0-9_-]{8,}`,
    String.raw`\bsk-[A-Za-z0-9_-]{20,}`,
    String.raw`\bAKIA[0-9A-Z]{16}\b`,
    String.raw`\bgh[opsu]_[A-Za-z0-9]{36,}`,
    String.raw`\bAIza[0-9A-Za-z_-]{35}\b`
  ].join('|'),
  'giu'
)
const redactSecrets = (s: string): string => s.replaceAll(COMBINED_RE, '[REDACTED]')
export {
  AWS_ACCESS_KEY_RE,
  COMBINED_RE,
  E2B_KEY_RE,
  GITHUB_TOKEN_RE,
  GOOGLE_KEY_RE,
  JWT_RE,
  OPENAI_KEY_RE,
  PROXY_TOKEN_RE,
  redactSecrets,
  SK_ANT_RE
}
