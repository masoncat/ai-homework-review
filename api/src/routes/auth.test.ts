import { describe, expect, it } from 'vitest';
import { app } from '../app.js';

describe('POST /auth/session', () => {
  it('returns a short-lived token for a valid invite code', async () => {
    const res = await app.request('http://local/auth/session', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://demo.example.com',
      },
      body: JSON.stringify({
        inviteCode: 'demo-code',
        humanToken: 'pass-human-check',
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(
      'https://demo.example.com'
    );
  });
});
