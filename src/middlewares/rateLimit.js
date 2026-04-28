import rateLimit from "express-rate-limit";

// In-memory fallback entry
class CustomRateLimitStore {
  constructor(prefix) {
    this.prefix = prefix;
    this.memoryStore = new Map();
  }

  async increment(key) {
    key = `${this.prefix}:${key}`;

    const now = Date.now();
    const windowMs = 15 * 60 * 1000;

    if (!this.memoryStore.has(key)) {
      this.memoryStore.set(key, { count: 1, resetTime: now + windowMs });
      return { totalHits: 1, resetTime: new Date(now + windowMs) };
    }

    const entry = this.memoryStore.get(key);

    if (now > entry.resetTime) {
      entry.count = 1;
      entry.resetTime = now + windowMs;
      return { totalHits: 1, resetTime: new Date(entry.resetTime) };
    }

    entry.count++;
    return { totalHits: entry.count, resetTime: new Date(entry.resetTime) };
  }

  async decrement(key) {
    key = `${this.prefix}:${key}`;
    const entry = this.memoryStore.get(key);
    if (entry && entry.count > 0) entry.count--;
  }

  async resetKey(key) {
    key = `${this.prefix}:${key}`;
    this.memoryStore.delete(key);
  }
}

export const generalRateLimiter = rateLimit({
  store: new CustomRateLimitStore("general"),
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests, please slow down",
    statusCode: 429,
  },
});

export const authRateLimiter = rateLimit({
  store: new CustomRateLimitStore("auth"),
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts, please slow down",
    statusCode: 429,
  },
});

export const apiRateLimiter = rateLimit({
  store: new CustomRateLimitStore("api"),
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many API requests, please slow down",
    statusCode: 429,
  },
});
