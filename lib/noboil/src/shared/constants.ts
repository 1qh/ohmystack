const ACTIVE_ORG_COOKIE = 'activeOrgId'
const ACTIVE_ORG_SLUG_COOKIE = 'activeOrgSlug'
const BULK_MAX = 100
const BYTES_PER_KB = 1024
const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365
const UNDO_MS = 5000
const sleep = async (ms: number) =>
  new Promise<void>(resolve => {
    setTimeout(resolve, ms)
  })
export {
  ACTIVE_ORG_COOKIE,
  ACTIVE_ORG_SLUG_COOKIE,
  BULK_MAX,
  BYTES_PER_KB,
  BYTES_PER_MB,
  ONE_YEAR_SECONDS,
  sleep,
  UNDO_MS
}
