import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort } from '@devvit/web/server';
import { api } from './routes/api.js';
import { menu } from './routes/menu.js';

const app = new Hono();

app.route('/api', api);
app.route('/internal/menu', menu);

serve({
    fetch: app.fetch,
    createServer,
    port: getServerPort(),
});
