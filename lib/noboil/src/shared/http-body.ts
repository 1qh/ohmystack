const DEFAULT_MAX_HTTP_BODY = 2_000_000
const jsonErr = (error: string, status: number): Response => Response.json({ error }, { status })
const parseHttpBody = async (req: Request, max: number = DEFAULT_MAX_HTTP_BODY): Promise<unknown> => {
  const ct = req.headers.get('Content-Type') ?? ''
  if (!ct.includes('application/json')) return jsonErr('Content-Type must be application/json', 400)
  const cl = req.headers.get('content-length')
  if (cl && Number(cl) > max) return jsonErr('body too large', 413)
  const text = await req.text()
  if (text.length > max) return jsonErr('body too large', 413)
  try {
    return JSON.parse(text) as unknown
  } catch {
    return jsonErr('invalid JSON body', 400)
  }
}
export { DEFAULT_MAX_HTTP_BODY, jsonErr, parseHttpBody }
