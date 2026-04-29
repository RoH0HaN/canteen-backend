import NodeCache from "node-cache";

// Standard TTL: 5 minutes (300 seconds)
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

export const cacheHelper = {
  get(key) {
    return cache.get(key);
  },
  set(key, value, ttl = 300) {
    return cache.set(key, value, ttl);
  },
  del(key) {
    return cache.del(key);
  },
  flush() {
    cache.flushAll();
  },
  // Delete keys matching a pattern (e.g., "vendors:*")
  delPattern(pattern) {
    const keys = cache.keys().filter((key) => key.startsWith(pattern));
    if (keys.length) cache.del(keys);
  },
};
