export async function requestWithTimeout(
  request,
  controller = new AbortController(),
  timeoutMs = 30000,
) {
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  let cancelWait
  const cancelled = new Promise((_, reject) => {
    cancelWait = () => reject(controller.signal.reason)
    controller.signal.addEventListener('abort', cancelWait, { once: true })
  })
  try {
    controller.signal.throwIfAborted()
    // Authentication can stall before fetch receives the signal, so bound the whole operation.
    const result = await Promise.race([request(controller.signal), cancelled])
    controller.signal.throwIfAborted()
    return result
  } finally {
    clearTimeout(timeout)
    controller.signal.removeEventListener('abort', cancelWait)
  }
}
