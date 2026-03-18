const ACTIVE_ORG_COOKIE = 'activeOrgId',
  ACTIVE_ORG_SLUG_COOKIE = 'activeOrgSlug',
  BULK_MAX = 100,
  BYTES_PER_KB = 1024,
  BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB,
  ONE_YEAR_SECONDS = 60 * 60 * 24 * 365,
  UNDO_MS = 5000,
  sleep = async (ms: number) =>
    // oxlint-disable-next-line promise/avoid-new
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
