/**
 * In-process rate limit for /api/places/search — 30 req/min/IP.
 * ponytail: per-instance counter, so a multi-instance deploy allows limit x instances.
 * Upgrade path: shared store (Upstash/Redis). Same known limitation as /api/places/detail.
 */
import { createPlacesRateLimiter } from "./places-rate-limiter";

const limiter = createPlacesRateLimiter(30);

export const placesSearchRateLimitKey = limiter.rateLimitKey;
export const isPlacesSearchRateLimited = limiter.isRateLimited;
export const resetPlacesSearchRateLimitsForTests = limiter.resetForTests;
