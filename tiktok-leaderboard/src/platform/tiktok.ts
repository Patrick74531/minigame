import { AuthError } from '../domain/errors';
import type { Platform } from '../domain/types';
import type { PlatformIdentity, PlatformIdentityProvider } from './identity';

/**
 * TikTok identity provider.
 *
 * In production, this should validate the TikTok login token via
 * TikTok's server-side API (code2session / jscode2session).
 * For MVP, it accepts a signed token header and extracts user info.
 *
 * Header: X-TikTok-Token — base64-encoded JSON { userId, displayName, avatarUrl }
 * TODO: Replace with real TikTok OAuth code2session flow in production.
 */
export class TikTokIdentityProvider implements PlatformIdentityProvider {
  readonly platform: Platform = 'tiktok';

  async resolveIdentity(headers: Headers): Promise<PlatformIdentity> {
    const token = headers.get('x-tiktok-token');
    if (!token) {
      throw new AuthError('Missing X-TikTok-Token header');
    }

    try {
      const decoded = this.decodeBase64Utf8(token);
      const payload = JSON.parse(decoded) as {
        userId?: string;
        displayName?: string;
        avatarUrl?: string;
      };

      if (!payload.userId || typeof payload.userId !== 'string') {
        throw new AuthError('Invalid token: missing userId');
      }

      return {
        platformUserId: payload.userId,
        displayName: payload.displayName || '',
        avatarUrl: payload.avatarUrl || '',
      };
    } catch (e) {
      if (e instanceof AuthError) throw e;
      throw new AuthError('Invalid or malformed X-TikTok-Token');
    }
  }

  private decodeBase64Utf8(token: string): string {
    const bytes = atob(token);
    const encoded = bytes
      .split('')
      .map((ch) => `%${ch.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join('');
    try {
      return decodeURIComponent(encoded);
    } catch {
      return bytes;
    }
  }
}
