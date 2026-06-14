// In-process rate limiter extracted from server/app.js. Behavior matches the
// production limiter exactly — do not loosen without updating tests.
//
// This is intentionally dependency-free so the project can start enforcing
// limits without adding a runtime dependency. If/when ListingStager runs on
// more than one server instance, swap the bucket Map for a Redis-backed store
// (and add an integration test) — the public API of createRateLimiter and the
// limiter factories below should not need to change.

function parsePositiveIntEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function rateLimitKey(req) {
  return (
    req.companyId ||
    req.user?.companyId ||
    req.user?.userId ||
    req.ip ||
    req.headers?.['x-forwarded-for'] ||
    'unknown'
  );
}

function createRateLimiter({ name, windowMs, max, message }) {
  const buckets = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = `${name}:${rateLimitKey(req)}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    if (buckets.size > 10000) {
      for (const [bucketKey, value] of buckets.entries()) {
        if (value.resetAt <= now) buckets.delete(bucketKey);
      }
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error: message,
        code: 'RATE_LIMITED',
        retryAfterSeconds,
      });
    }

    next();
  };
}

// Factory that returns the full set of limiters wired with env-driven defaults
// matching the values listed in server/.env.example. Memoized so multiple
// route modules can call it and still share one bucket map per limiter —
// otherwise extracting /api/generate to one file and /api/optimizer/ai-optimize
// to another would silently double a tenant's effective AI quota. Tests that
// need a fresh set can call `resetSharedRateLimiters()` between cases.
let sharedLimiters = null;

function createDefaultRateLimiters() {
  if (sharedLimiters) return sharedLimiters;
  sharedLimiters = {
    globalApiRateLimit: createRateLimiter({
      name: 'global-api',
      windowMs: 60 * 1000,
      max: parsePositiveIntEnv('API_RATE_LIMIT_PER_MINUTE', 300),
      message: 'Too many requests. Try again shortly.',
    }),
    authenticatedApiRateLimit: createRateLimiter({
      name: 'auth-api',
      windowMs: 60 * 1000,
      max: parsePositiveIntEnv('AUTH_API_RATE_LIMIT_PER_MINUTE', 900),
      message: 'Too many authenticated requests. Try again shortly.',
    }),
    aiRateLimit: createRateLimiter({
      name: 'ai',
      windowMs: 60 * 60 * 1000,
      max: parsePositiveIntEnv('AI_RATE_LIMIT_PER_HOUR', 20),
      message: 'Too many AI requests. Try again later.',
    }),
    imageRateLimit: createRateLimiter({
      name: 'images',
      windowMs: 60 * 60 * 1000,
      max: parsePositiveIntEnv('IMAGE_RATE_LIMIT_PER_HOUR', 60),
      message: 'Too many image processing requests. Try again later.',
    }),
    ebayReadRateLimit: createRateLimiter({
      name: 'ebay-read',
      windowMs: 60 * 60 * 1000,
      max: parsePositiveIntEnv('EBAY_READ_RATE_LIMIT_PER_HOUR', 240),
      message: 'Too many eBay lookup requests. Try again later.',
    }),
    ebayWriteRateLimit: createRateLimiter({
      name: 'ebay-write',
      windowMs: 60 * 60 * 1000,
      max: parsePositiveIntEnv('EBAY_WRITE_RATE_LIMIT_PER_HOUR', 120),
      message: 'Too many eBay listing update requests. Try again later.',
    }),
    compsRateLimit: createRateLimiter({
      name: 'comps',
      windowMs: 60 * 60 * 1000,
      max: parsePositiveIntEnv('COMPS_RATE_LIMIT_PER_HOUR', 180),
      message: 'Too many comparable-sales requests. Try again later.',
    }),
  };
  return sharedLimiters;
}

function resetSharedRateLimiters() {
  sharedLimiters = null;
}

module.exports = {
  parsePositiveIntEnv,
  rateLimitKey,
  createRateLimiter,
  createDefaultRateLimiters,
  resetSharedRateLimiters,
};
