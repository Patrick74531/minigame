import type { Platform } from '../domain/types';

/**
 * Platform identity provider interface.
 * Each platform implements this to resolve user identity from request context.
 * To add a new platform: implement this interface and register in the router.
 */
export interface PlatformIdentityProvider {
  readonly platform: Platform;

  /**
   * Resolve the platform-specific user identity from the incoming request.
   * Returns { platformUserId, displayName, avatarUrl }.
   * Throws AuthError if the token/session is invalid.
   */
  resolveIdentity(headers: Headers): Promise<PlatformIdentity>;
}

export interface PlatformIdentity {
  platformUserId: string;
  displayName: string;
  avatarUrl: string;
}
