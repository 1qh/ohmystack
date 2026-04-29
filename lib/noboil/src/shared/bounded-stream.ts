interface BoundedBodyOpts {
  idleMs?: number
  onAbort?: () => void
  onClose?: () => void
  onExceed?: () => void
  sse?: boolean
}
const boundedBody = (
  body: null | ReadableStream<Uint8Array>,
  max: number,
  opts?: BoundedBodyOpts
): null | ReadableStream<Uint8Array> => {
  if (!body) return null
  let seen = 0
  let idleTimer: null | ReturnType<typeof setTimeout> = null
  const armIdle = (ctrl: TransformStreamDefaultController<Uint8Array>): void => {
    if (!opts?.idleMs) return
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      if (opts.sse)
        try {
          ctrl.enqueue(new TextEncoder().encode('event: error\ndata: {"error":"upstream idle"}\n\n'))
        } catch {
          /* Already terminated */
        }
      opts.onAbort?.()
      ctrl.error(new Error('upstream idle'))
    }, opts.idleMs)
  }
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      flush: () => {
        if (idleTimer) clearTimeout(idleTimer)
        opts?.onClose?.()
      },
      start: ctrl => armIdle(ctrl),
      transform: (chunk, controller) => {
        seen += chunk.byteLength
        if (seen > max) {
          if (idleTimer) clearTimeout(idleTimer)
          opts?.onExceed?.()
          opts?.onAbort?.()
          controller.error(new Error('body too large'))
          return
        }
        controller.enqueue(chunk)
        armIdle(controller)
      }
    })
  )
}
export type { BoundedBodyOpts }
export { boundedBody }
