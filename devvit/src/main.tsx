import { Devvit, useWebView } from '@devvit/public-api';
import type { JSONValue, RedisClient } from '@devvit/public-api';
import type { LeaderboardEntry } from './types.js';

function send(wv: { postMessage: (msg: JSONValue) => void }, msg: unknown): void {
    wv.postMessage(msg as JSONValue);
}

Devvit.configure({
    redditAPI: true,
    redis: true,
});

const RANK_KEY = 'leaderboard:scores';
const META_KEY = 'leaderboard:meta';
const FOLLOW_KEY = 'leaderboard:followers';
const LEADERBOARD_SIZE = 10;

async function getLeaderboard(redis: RedisClient): Promise<LeaderboardEntry[]> {
    const members = await redis.zRange(RANK_KEY, 0, LEADERBOARD_SIZE - 1, {
        reverse: true,
        by: 'rank',
    });
    if (!members || members.length === 0) return [];

    const allMeta = (await redis.hGetAll(META_KEY)) ?? {};

    return members.map((entry, i) => {
        const { member: username, score } = entry as { member: string; score: number };
        let wave = 0;
        const metaStr = allMeta[username];
        if (metaStr) {
            try {
                const parsed = JSON.parse(metaStr) as { wave?: number };
                wave = parsed.wave ?? 0;
            } catch (_e) {
                wave = 0;
            }
        }
        return { rank: i + 1, username, score: Math.round(score), wave };
    });
}

async function submitScore(
    redis: RedisClient,
    username: string,
    score: number,
    wave: number
): Promise<{ rank: number; isNewBest: boolean }> {
    const existing = await redis.zScore(RANK_KEY, username);
    const isNewBest = existing == null || score > existing;

    if (isNewBest) {
        await redis.zAdd(RANK_KEY, { score, member: username });
        await redis.hSet(META_KEY, { [username]: JSON.stringify({ wave, updatedAt: Date.now() }) });
    }

    const leaderboard = await getLeaderboard(redis);
    const rankIdx = leaderboard.findIndex(e => e.username === username);
    return {
        rank: rankIdx >= 0 ? rankIdx + 1 : LEADERBOARD_SIZE + 1,
        isNewBest,
    };
}

function App(context: Devvit.Context) {
    const webView = useWebView({
        url: 'index.html',
        async onMessage(rawMessage, wv) {
            const message = rawMessage as { type: string; payload?: Record<string, unknown> };
            const { reddit, redis } = context;

            try {
                switch (message.type) {
                    case 'INIT': {
                        const [user, leaderboard, subreddit] = await Promise.all([
                            reddit.getCurrentUser(),
                            getLeaderboard(redis),
                            reddit.getSubredditById(context.subredditId!),
                        ]);

                        const username = user?.username ?? 'Anonymous';
                        const isFollowed = (await redis.hGet(FOLLOW_KEY, username)) === '1';

                        send(wv, {
                            type: 'INIT_RESPONSE',
                            payload: {
                                username,
                                isSubscribed: isFollowed,
                                subredditName: subreddit?.name ?? '',
                                leaderboard,
                            },
                        });
                        break;
                    }

                    case 'SUBMIT_SCORE': {
                        const user = await reddit.getCurrentUser();
                        if (!user) {
                            send(wv, { type: 'ERROR', payload: { message: 'Not logged in' } });
                            return;
                        }

                        const { score, wave } = message.payload as { score: number; wave: number };
                        const { rank, isNewBest } = await submitScore(
                            redis,
                            user.username,
                            score,
                            wave
                        );

                        send(wv, { type: 'SCORE_SUBMITTED', payload: { rank, score, isNewBest } });
                        break;
                    }

                    case 'GET_LEADERBOARD': {
                        const leaderboard = await getLeaderboard(redis);
                        send(wv, { type: 'LEADERBOARD_DATA', payload: { entries: leaderboard } });
                        break;
                    }

                    case 'SUBSCRIBE': {
                        const user = await reddit.getCurrentUser();

                        if (user) {
                            await redis.hSet(FOLLOW_KEY, { [user.username]: '1' });
                        }

                        send(wv, { type: 'SUBSCRIPTION_RESULT', payload: { success: true } });
                        break;
                    }
                }
            } catch (err) {
                send(wv, { type: 'ERROR', payload: { message: String(err) } });
            }
        },
        onUnmount() {
            context.ui.showToast({ text: 'Game closed', appearance: 'neutral' });
        },
    });

    return (
        <vstack height="100%" width="100%" alignment="center middle" backgroundColor="#1a1a2e">
            <image url="thumbnail.png" imageWidth={400} imageHeight={225} resizeMode="fit" />
            <spacer size="medium" />
            <text size="xlarge" weight="bold" color="white">
                Tower Defense
            </text>
            <text size="small" color="#aaaaaa">
                Defend the base. Set the high score.
            </text>
            <spacer size="medium" />
            <button onPress={() => webView.mount()} appearance="primary" size="large">
                🎮 Play Now
            </button>
        </vstack>
    );
}

Devvit.addCustomPostType({
    name: 'Tower Defense Game',
    description: 'A casual tower defense game. How many waves can you hold?',
    render: App,
});

Devvit.addMenuItem({
    label: '🏰 New Tower Defense Post',
    location: 'subreddit',
    onPress: async (_event, context) => {
        const subreddit = await context.reddit.getSubredditById(context.subredditId!);
        const post = await context.reddit.submitPost({
            title: '🏰 Tower Defense — How Far Can You Go?',
            subredditName: subreddit?.name ?? '',
            preview: (
                <vstack
                    height="100%"
                    width="100%"
                    alignment="center middle"
                    backgroundColor="#1a1a2e"
                >
                    <text size="xlarge" weight="bold" color="white">
                        Loading game...
                    </text>
                </vstack>
            ),
        });
        context.ui.showToast({ text: 'Game post created!', appearance: 'success' });
        context.ui.navigateTo(post);
    },
});

export default Devvit;
