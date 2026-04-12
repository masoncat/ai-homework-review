import type { MiddlewareHandler } from 'hono';
import type { AppConfig } from '../config.js';
import type { AppBindings } from '../types.js';

function resolveOrigin(origin: string | undefined, config: AppConfig) {
  if (!origin) {
    return config.allowedOrigins[0] ?? '*';
  }

  return config.allowedOrigins.includes(origin) ? origin : config.allowedOrigins[0] ?? '*';
}

export function corsHeaders(origin: string | undefined, config: AppConfig) {
  return {
    'access-control-allow-origin': resolveOrigin(origin, config),
    'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

export const withCors: MiddlewareHandler<AppBindings> = async (c, next) => {
  await next();

  const headers = corsHeaders(c.req.header('origin'), c.get('config'));

  Object.entries(headers).forEach(([key, value]) => {
    c.header(key, value);
  });
};
