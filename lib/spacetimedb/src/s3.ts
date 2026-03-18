interface S3PresignCommonOptions {
  accessKeyId: string
  bucket: string
  endpoint: string
  expiresInSeconds?: number
  key: string
  region: string
  secretAccessKey: string
  sessionToken?: string
}

type S3PresignDownloadOptions = S3PresignCommonOptions

interface S3PresignedUrl {
  expiresAt: number
  headers: Record<string, string>
  key: string
  method: 'GET' | 'PUT'
  url: string
}

interface S3PresignUploadOptions extends S3PresignCommonOptions {
  contentType?: string
}

const HEX_RADIX = 16,
  YEAR_LENGTH = 4,
  SECONDS_IN_MILLISECOND = 1000,
  MAX_PRESIGN_EXPIRY_SECONDS = 604_800,
  DEFAULT_PRESIGN_EXPIRY_SECONDS = 900,
  TRAILING_SLASH_REGEX = /\/$/u,
  URI_EXTRA_REGEX = /[!'()*]/gu,
  encodeUriSegment = (value: string): string =>
    encodeURIComponent(value).replace(URI_EXTRA_REGEX, c => {
      const code = c.codePointAt(0)
      return `%${(code ?? 0).toString(HEX_RADIX).toUpperCase()}`
    }),
  encodeCanonicalPath = (value: string): string => {
    const segments = value.split('/'),
      out: string[] = []
    for (const segment of segments) out.push(encodeUriSegment(segment))
    return out.join('/')
  },
  toHex = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer)
    let hex = ''
    for (const byte of bytes) hex += byte.toString(HEX_RADIX).padStart(2, '0')
    return hex
  },
  toDateParts = (date: Date): { amzDate: string; dateStamp: string } => {
    const year = date.getUTCFullYear().toString().padStart(YEAR_LENGTH, '0'),
      month = (date.getUTCMonth() + 1).toString().padStart(2, '0'),
      day = date.getUTCDate().toString().padStart(2, '0'),
      hours = date.getUTCHours().toString().padStart(2, '0'),
      minutes = date.getUTCMinutes().toString().padStart(2, '0'),
      seconds = date.getUTCSeconds().toString().padStart(2, '0')
    return {
      amzDate: `${year}${month}${day}T${hours}${minutes}${seconds}Z`,
      dateStamp: `${year}${month}${day}`
    }
  },
  toCanonicalQuery = (params: Record<string, string>): string => {
    const keys = Object.keys(params).toSorted(),
      pairs: string[] = []
    for (const key of keys) pairs.push(`${encodeUriSegment(key)}=${encodeUriSegment(params[key] ?? '')}`)
    return pairs.join('&')
  },
  hmac = async (key: BufferSource, message: string): Promise<ArrayBuffer> => {
    const cryptoKey = await crypto.subtle.importKey('raw', key, { hash: 'SHA-256', name: 'HMAC' }, false, ['sign']),
      data = new TextEncoder().encode(message)
    return crypto.subtle.sign('HMAC', cryptoKey, data)
  },
  sha256Hex = async (value: string): Promise<string> => {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
    return toHex(hash)
  },
  signingKey = async (secretAccessKey: string, dateStamp: string, region: string): Promise<ArrayBuffer> => {
    const kDate = await hmac(new TextEncoder().encode(`AWS4${secretAccessKey}`), dateStamp),
      kRegion = await hmac(kDate, region),
      kService = await hmac(kRegion, 's3')
    return hmac(kService, 'aws4_request')
  },
  toHost = (endpoint: URL): string => (endpoint.port ? `${endpoint.hostname}:${endpoint.port}` : endpoint.hostname),
  makePresignedRequest = async ({
    accessKeyId,
    bucket,
    contentType,
    endpoint,
    expiresInSeconds,
    key,
    method,
    region,
    secretAccessKey,
    sessionToken
  }: {
    accessKeyId: string
    bucket: string
    contentType?: string
    endpoint: string
    expiresInSeconds?: number
    key: string
    method: 'GET' | 'PUT'
    region: string
    secretAccessKey: string
    sessionToken?: string
  }): Promise<S3PresignedUrl> => {
    const now = new Date(),
      { amzDate, dateStamp } = toDateParts(now),
      normalizedExpiry = Math.max(
        1,
        Math.min(expiresInSeconds ?? DEFAULT_PRESIGN_EXPIRY_SECONDS, MAX_PRESIGN_EXPIRY_SECONDS)
      ),
      endpointUrl = new URL(endpoint),
      host = toHost(endpointUrl),
      pathPrefix = endpointUrl.pathname === '/' ? '' : endpointUrl.pathname.replace(TRAILING_SLASH_REGEX, ''),
      canonicalObjectPath = `${pathPrefix}/${encodeUriSegment(bucket)}/${key.split('/').map(encodeUriSegment).join('/')}`,
      canonicalUri = encodeCanonicalPath(canonicalObjectPath),
      credentialScope = `${dateStamp}/${region}/s3/aws4_request`,
      headers: Record<string, string> = {
        host
      },
      signedHeaderNames: string[] = ['host']

    if (contentType) {
      headers['content-type'] = contentType
      signedHeaderNames.push('content-type')
    }

    signedHeaderNames.sort((a, b) => a.localeCompare(b))

    const canonicalHeaders = `${signedHeaderNames.map(name => `${name}:${headers[name]}`).join('\n')}\n`,
      signedHeaders = signedHeaderNames.join(';'),
      queryParams: Record<string, string> = {
        'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
        'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
        'X-Amz-Date': amzDate,
        'X-Amz-Expires': String(normalizedExpiry),
        'X-Amz-SignedHeaders': signedHeaders
      }

    if (sessionToken) queryParams['X-Amz-Security-Token'] = sessionToken

    const canonicalQuery = toCanonicalQuery(queryParams),
      canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders}\nUNSIGNED-PAYLOAD`,
      canonicalRequestHash = await sha256Hex(canonicalRequest),
      stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`,
      keyBytes = await signingKey(secretAccessKey, dateStamp, region),
      signature = toHex(await hmac(keyBytes, stringToSign)),
      finalQuery = `${canonicalQuery}&X-Amz-Signature=${signature}`,
      url = `${endpointUrl.protocol}//${host}${canonicalUri}?${finalQuery}`,
      clientHeaders: Record<string, string> = {}

    if (contentType) clientHeaders['content-type'] = contentType

    return {
      expiresAt: now.getTime() + normalizedExpiry * SECONDS_IN_MILLISECOND,
      headers: clientHeaders,
      key,
      method,
      url
    }
  },
  createS3UploadPresignedUrl = async (options: S3PresignUploadOptions): Promise<S3PresignedUrl> =>
    makePresignedRequest({ ...options, method: 'PUT' }),
  createS3DownloadPresignedUrl = async (options: S3PresignDownloadOptions): Promise<S3PresignedUrl> =>
    makePresignedRequest({ ...options, method: 'GET' })

export type { S3PresignDownloadOptions, S3PresignedUrl, S3PresignUploadOptions }
export { createS3DownloadPresignedUrl, createS3UploadPresignedUrl }
