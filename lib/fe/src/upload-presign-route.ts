// biome-ignore-all lint/style/noProcessEnv: server-only route
import type { NextRequest } from 'next/server'
import { createS3UploadPresignedUrl } from '@noboil/spacetimedb/s3'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
interface PresignBody {
  contentType?: string
  filename?: string
  size?: number
}
const MAX_FILE_SIZE = 10 * 1024 * 1024
const PRESIGN_EXPIRY_SECONDS = 900
const S3_REGION = 'us-east-1'
const generateStorageKey = (filename: string): string => {
  const timestamp = Date.now()
  const random = crypto.randomUUID()
  const safeName = filename.replaceAll(/[^\w.-]/gu, '_')
  return `uploads/${timestamp}-${random}-${safeName}`
}
const POST = async (request: NextRequest) => {
  const cookieStore = await cookies()
  const token = cookieStore.get('spacetimedb_token')?.value ?? ''
  if (!token) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const accessKeyId = process.env.S3_ACCESS_KEY_ID
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY
  const endpoint = process.env.S3_ENDPOINT
  const bucket = process.env.S3_BUCKET
  if (!(accessKeyId && secretAccessKey && endpoint && bucket))
    return NextResponse.json({ error: 'S3 not configured' }, { status: 500 })
  const body = (await request.json()) as PresignBody
  const { contentType, filename, size } = body
  if (typeof filename !== 'string' || !filename)
    return NextResponse.json({ error: 'filename is required' }, { status: 400 })
  if (typeof size !== 'number' || size <= 0)
    return NextResponse.json({ error: 'size must be a positive number' }, { status: 400 })
  if (size > MAX_FILE_SIZE)
    return NextResponse.json({ error: `File size exceeds ${MAX_FILE_SIZE} bytes` }, { status: 400 })
  const storageKey = generateStorageKey(filename)
  const presigned = await createS3UploadPresignedUrl({
    accessKeyId,
    bucket,
    contentType: typeof contentType === 'string' ? contentType : undefined,
    endpoint,
    expiresInSeconds: PRESIGN_EXPIRY_SECONDS,
    key: storageKey,
    region: S3_REGION,
    secretAccessKey
  })
  return NextResponse.json({
    headers: presigned.headers,
    method: presigned.method,
    storageKey: presigned.key,
    uploadUrl: presigned.url
  })
}
export { POST }
