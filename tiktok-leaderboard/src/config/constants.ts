/** Leaderboard page size */
export const LEADERBOARD_PAGE_SIZE = 50;

/** Maximum score value accepted (anti-cheat sanity check) */
export const MAX_SCORE = 999_999_999;

/** Maximum wave value accepted */
export const MAX_WAVE = 99_999;

/** Idempotency key TTL in seconds (1 hour) */
export const IDEMPOTENCY_TTL_SECONDS = 3600;

/** Rate-limit: max score submissions per player per minute */
export const RATE_LIMIT_SUBMITS_PER_MINUTE = 10;

/** Rate-limit sliding window in seconds */
export const RATE_LIMIT_WINDOW_SECONDS = 60;

/** Diamond rules */
export const DIAMOND_INITIAL_BALANCE = 0;
export const DIAMOND_PER_WAVE = 10;
export const DIAMOND_ITEM_PRICE = 100;
export const DIAMOND_DAILY_CAP = 5000;
