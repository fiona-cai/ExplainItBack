// Retry utility with exponential backoff

export interface RetryOptions {
  maxAttempts?: number
  initialDelayMs?: number
  maxDelayMs?: number
  backoffMultiplier?: number
  retryableErrors?: (error: any) => boolean
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: (error: any) => {
    // Retry on network errors, rate limits, and 5xx errors
    if (error?.status === 429 || error?.status >= 500) {
      return true
    }
    if (error?.message?.includes('rate limit') || error?.message?.includes('timeout')) {
      return true
    }
    return false
  },
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  let lastError: any

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error

      // Don't retry if it's the last attempt or error is not retryable
      if (attempt === opts.maxAttempts || !opts.retryableErrors(error)) {
        throw error
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
        opts.maxDelayMs
      )

      // Add jitter to prevent thundering herd
      const jitter = Math.random() * 0.3 * delay
      await new Promise((resolve) => setTimeout(resolve, delay + jitter))
    }
  }

  throw lastError
}
