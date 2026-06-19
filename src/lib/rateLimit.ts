type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

const MAX_TRACKED_BUCKETS = 5000

/**
 * Fixed-window limiter. In-memory and per-instance — good enough to stop a
 * single client hammering an endpoint without needing a shared store like
 * Redis for this traffic scale.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    if (buckets.size > MAX_TRACKED_BUCKETS) pruneExpiredBuckets(now)
    return true
  }

  if (bucket.count >= limit) return false

  bucket.count += 1
  return true
}

function pruneExpiredBuckets(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'unknown'
}
