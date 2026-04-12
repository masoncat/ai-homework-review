import { Hono } from 'hono';

const healthRoute = new Hono();

healthRoute.get('/', (c) => c.text('ok'));

export default healthRoute;
