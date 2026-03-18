// biome-ignore-all lint/style/noProcessEnv: server-only route
import type { NextRequest } from 'next/server'

import { createS3UploadPresignedUrl } from '@noboil/spacetimedb/s3'
import { NextResponse } from 'next/server'

interface PresignBody {
  contentType?: string
  filename?: string
  size?: number
}

const MAX_FILE_SIZE = 10 * 1024 * 1024,
  PRESIGN_EXPIRY_SECONDS = 900,
  S3_REGION = 'us-east-1',
  generateStorageKey = (filename: string): string => {
    const timestamp = Date.now(),
      random = Math.random().toString(36).slice(2, 10),
      safeName = filename.replaceAll(/[^\w.-]/gu, '_')
    return `uploads/${timestamp}-${random}-${safeName}`
  },
  POST = async (request: NextRequest) => {
    const accessKeyId = process.env.S3_ACCESS_KEY_ID,
      secretAccessKey = process.env.S3_SECRET_ACCESS_KEY,
      endpoint = process.env.S3_ENDPOINT,
      bucket = process.env.S3_BUCKET

    if (!(accessKeyId && secretAccessKey && endpoint && bucket))
      return NextResponse.json({ error: 'S3 not configured' }, { status: 500 })

    const body = (await request.json()) as PresignBody,
      { contentType, filename, size } = body

    if (typeof filename !== 'string' || !filename)
      return NextResponse.json({ error: 'filename is required' }, { status: 400 })

    if (typeof size !== 'number' || size <= 0)
      return NextResponse.json({ error: 'size must be a positive number' }, { status: 400 })

    if (size > MAX_FILE_SIZE)
      return NextResponse.json({ error: `File size exceeds ${MAX_FILE_SIZE} bytes` }, { status: 400 })

    const storageKey = generateStorageKey(filename),
      presigned = await createS3UploadPresignedUrl({
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
