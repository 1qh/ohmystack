import imageCompression from 'browser-image-compression'
const BYTES_PER_KB = 1024
const BYTES_PER_MB = 1024 * 1024
const fmt = (n: number) =>
  n < BYTES_PER_KB
    ? `${n} B`
    : n < BYTES_PER_MB
      ? `${(n / BYTES_PER_KB).toFixed(1)} KB`
      : `${(n / BYTES_PER_MB).toFixed(1)} MB`
const isImgType = (t: string) => t.startsWith('image/')
const isImgUrl = (url: string) => {
  const lower = url.toLowerCase()
  if (lower.startsWith('data:image/') || lower.startsWith('blob:')) return true
  return (
    lower.includes('.png') ||
    lower.includes('.jpg') ||
    lower.includes('.jpeg') ||
    lower.includes('.gif') ||
    lower.includes('.webp') ||
    lower.includes('.svg') ||
    lower.includes('.bmp') ||
    lower.includes('.avif')
  )
}
const getLastPath = (pathname: string): string => {
  const parts = pathname.split('/')
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i]
    if (part) return part
  }
  return ''
}
const fileLabel = (url: string) => {
  try {
    const parsed = new URL(url)
    const part = getLastPath(parsed.pathname)
    return decodeURIComponent(part || 'File')
  } catch {
    return 'File'
  }
}
const parseAccept = (a?: string): Record<string, string[]> | undefined =>
  a ? Object.fromEntries(a.split(',').map(t => [t.trim(), []])) : undefined
const compress = async (f: File, on: boolean) => {
  if (!(on && isImgType(f.type))) return f
  try {
    return await imageCompression(f, { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true })
  } catch {
    return f
  }
}
export { compress, fileLabel, fmt, isImgType, isImgUrl, parseAccept }
