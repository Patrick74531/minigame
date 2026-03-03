import type { Env } from '../config/env';
import { AppError, AuthError } from '../domain/errors';

interface TokenExchangeResult {
    accessToken: string;
    openId: string;
}

interface TikTokProfileResult {
    userId: string;
    displayName: string;
    avatarUrl: string;
}

export class TikTokIdentityService {
    constructor(private env: Env) {}

    async resolveProfileByCode(code: string): Promise<TikTokProfileResult> {
        const normalizedCode = code.trim();
        if (!normalizedCode) {
            throw new AuthError('Missing TikTok authorization code');
        }

        const token = await this.exchangeCode(normalizedCode);
        const profile = await this.fetchUserProfile(token.accessToken);
        if (!profile.userId) {
            return {
                userId: token.openId,
                displayName: '',
                avatarUrl: '',
            };
        }
        return profile;
    }

    private async exchangeCode(code: string): Promise<TokenExchangeResult> {
        if (!this.env.TIKTOK_APP_ID || !this.env.TIKTOK_APP_SECRET) {
            throw new AppError('CONFIG_ERROR', 'TikTok app credentials are not configured', 500);
        }

        const body = new URLSearchParams({
            client_key: this.env.TIKTOK_APP_ID,
            client_secret: this.env.TIKTOK_APP_SECRET,
            code,
            grant_type: 'authorization_code',
        });

        const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: body.toString(),
        });

        const payload = await this.readJson(response);
        const errorCode = this.readFirstString(payload, [
            ['error', 'code'],
            ['error_code'],
            ['error'],
        ]);
        const errorMessage = this.readFirstString(payload, [
            ['error', 'message'],
            ['error_description'],
            ['message'],
            ['description'],
        ]);
        const logId = this.readFirstString(payload, [['log_id'], ['error', 'log_id']]);
        const isErrorCode =
            !!errorCode && !['ok', 'success', '0'].includes(errorCode.toLowerCase());
        if (!response.ok || isErrorCode) {
            throw new AuthError(
                this.formatUpstreamError('code exchange', response.status, errorCode, errorMessage, logId)
            );
        }

        const accessToken = this.readFirstString(payload, [
            ['access_token'],
            ['data', 'access_token'],
        ]);
        const openId = this.readFirstString(payload, [
            ['open_id'],
            ['openid'],
            ['data', 'open_id'],
            ['data', 'openid'],
        ]);
        if (!accessToken || !openId) {
            throw new AppError(
                'UPSTREAM_ERROR',
                `TikTok code exchange missing access_token/open_id (status=${response.status})`,
                502
            );
        }

        return { accessToken, openId };
    }

    private async fetchUserProfile(accessToken: string): Promise<TikTokProfileResult> {
        const response = await fetch(
            'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name',
            {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        );

        const payload = await this.readJson(response);
        const errorCode = this.readFirstString(payload, [
            ['error', 'code'],
            ['error_code'],
            ['error'],
        ]);
        const errorMessage = this.readFirstString(payload, [
            ['error', 'message'],
            ['error_description'],
            ['message'],
            ['description'],
        ]);
        const logId = this.readFirstString(payload, [['log_id'], ['error', 'log_id']]);
        const isErrorCode =
            !!errorCode && !['ok', 'success', '0'].includes(errorCode.toLowerCase());
        if (!response.ok || isErrorCode) {
            throw new AuthError(
                this.formatUpstreamError('user info', response.status, errorCode, errorMessage, logId)
            );
        }

        const userId = this.readFirstString(payload, [
            ['data', 'open_id'],
            ['data', 'user', 'open_id'],
            ['open_id'],
            ['user', 'open_id'],
        ]);
        const displayName = this.readFirstString(payload, [
            ['data', 'display_name'],
            ['data', 'user', 'display_name'],
            ['display_name'],
            ['user', 'display_name'],
        ]);
        const avatarUrl = this.readFirstString(payload, [
            ['data', 'avatar_url'],
            ['data', 'user', 'avatar_url'],
            ['avatar_url'],
            ['user', 'avatar_url'],
        ]);

        return {
            userId,
            displayName,
            avatarUrl,
        };
    }

    private async readJson(response: Response): Promise<unknown> {
        try {
            return await response.json();
        } catch {
            return {};
        }
    }

    private formatUpstreamError(
        stage: string,
        status: number,
        errorCode: string,
        errorMessage: string,
        logId: string
    ): string {
        const parts = [`HTTP ${status}`];
        if (errorCode) parts.push(`error=${errorCode}`);
        if (errorMessage) parts.push(`message=${errorMessage}`);
        if (logId) parts.push(`log_id=${logId}`);
        return `TikTok ${stage} failed (${parts.join(', ')})`;
    }

    private readFirstString(obj: unknown, paths: string[][]): string {
        for (const path of paths) {
            const value = this.readString(obj, path);
            if (value) return value;
        }
        return '';
    }

    private readString(obj: unknown, path: string[]): string {
        let cursor: unknown = obj;
        for (const key of path) {
            if (!this.isRecord(cursor)) return '';
            cursor = cursor[key];
        }
        return typeof cursor === 'string' ? cursor.trim() : '';
    }

    private isRecord(input: unknown): input is Record<string, unknown> {
        return !!input && typeof input === 'object';
    }
}
