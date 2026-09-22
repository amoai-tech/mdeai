const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function shouldRetryHttpStatus(status) {
  return TRANSIENT_HTTP_STATUSES.has(status);
}

export async function retryOperation(operation, options = {}) {
  const attempts = Math.max(1, Number(options.attempts ?? 3));
  const delayMs = Math.max(0, Number(options.delayMs ?? 250));

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt === attempts) throw error;
      options.onRetry?.(error, attempt);
      if (delayMs > 0) await sleep(delayMs * attempt);
    }
  }

  throw new Error("retryOperation exhausted unexpectedly");
}

export async function fetchWithRetry(url, fetchOptions = {}, retryOptions = {}) {
  const attempts = Math.max(1, Number(retryOptions.attempts ?? 3));
  const delayMs = Math.max(0, Number(retryOptions.delayMs ?? 250));
  const timeoutMs = Math.max(1, Number(retryOptions.timeoutMs ?? 12000));

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
      if (!shouldRetryHttpStatus(response.status) || attempt === attempts) return response;
      await response.body?.cancel();
      retryOptions.onRetry?.(new Error(`HTTP ${response.status}`), attempt);
    } catch (error) {
      if (attempt === attempts) throw error;
      retryOptions.onRetry?.(error, attempt);
    } finally {
      clearTimeout(timer);
    }
    if (delayMs > 0) await sleep(delayMs * attempt);
  }

  throw new Error("fetchWithRetry exhausted unexpectedly");
}
