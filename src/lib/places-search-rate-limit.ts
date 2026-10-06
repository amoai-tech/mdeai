/** In-process rate limit for /api/places/search — 30 req/min/IP. */
import { createPlacesRateLimiter } from "./places-rate-limiter";

const limiter = createPlacesRateLimiter(30);

export const placesSearchRateLimitKey = limiter.rateLimitKey;
export const isPlacesSearchRateLimited = limiter.isRateLimited;
export const resetPlacesSearchRateLimitsForTests = limiter.resetForTests;
