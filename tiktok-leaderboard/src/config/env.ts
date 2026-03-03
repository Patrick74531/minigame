/**
 * Cloudflare Worker bindings & environment variables.
 * All access to env goes through this typed interface.
 */
export interface Env {
  DB: D1Database;
  ENV: string;                    // 'dev' | 'staging' | 'production'
  TIKTOK_APP_ID: string;
  TIKTOK_APP_SECRET: string;      // set via `wrangler secret put`
  TIKTOK_ALLOWED_ORIGINS: string; // comma-separated origins or '*'
}

export function getEnvLabel(env: Env): string {
  return env.ENV || 'dev';
}

export function getAllowedOrigins(env: Env): string[] {
  const raw = env.TIKTOK_ALLOWED_ORIGINS || '*';
  const normalized = raw.trim().toLowerCase();
  if (!normalized || normalized === '*' || normalized === 'null') {
    return ['*'];
  }
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}
