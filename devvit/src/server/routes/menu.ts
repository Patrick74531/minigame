import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';

export const menu = new Hono();

menu.post('/create-post', async c => {
    try {
        const post = await reddit.submitCustomPost({
            title: '🤖 Granny vs Robot — How Far Can You Go?',
        });

        return c.json(
            {
                navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
            },
            200
        );
    } catch (error) {
        console.error('[menu/create-post] error:', error);
        return c.json({ showToast: 'Failed to create post' }, 400);
    }
});
