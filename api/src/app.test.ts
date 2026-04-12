import { describe, expect, it } from 'vitest';
import { app } from './app.js';

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await app.request('http://local/health');

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('returns cors headers for PUT preflight requests', async () => {
    const res = await app.request('http://local/uploads/direct/uploads/demo/sheet.png', {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'PUT',
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:5173'
    );
    expect(res.headers.get('access-control-allow-methods')).toContain('PUT');
  });
});
