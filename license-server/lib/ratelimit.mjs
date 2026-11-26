export function createRateLimiter({ maxKeys = 5000, clock = () => Date.now() } = {}) {
  const buckets = new Map();

  function cleanup(now) {
    for (const [key, bucket] of buckets) {
      if (bucket.reset <= now) buckets.delete(key);
    }
    if (buckets.size > maxKeys) {
      const excess = buckets.size - maxKeys;
      let removed = 0;
      for (const key of buckets.keys()) {
        buckets.delete(key);
        if (++removed >= excess) break;
      }
    }
  }

  return {
    hit(key, limit, windowMs) {
      const now = clock();
      let bucket = buckets.get(key);
      if (!bucket || bucket.reset <= now) {
        bucket = { count: 0, reset: now + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      if (buckets.size > maxKeys) cleanup(now);
      const ok = bucket.count <= limit;
      return {
        ok,
        limit,
        remaining: Math.max(0, limit - bucket.count),
        retryAfter: Math.max(1, Math.ceil((bucket.reset - now) / 1000)),
      };
    },
    reset() {
      buckets.clear();
    },
  };
}
