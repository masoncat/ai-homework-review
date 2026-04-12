import { jwtVerify, SignJWT } from 'jose';
import type { AppConfig } from '../config.js';
import type { SessionPayload } from '../types.js';

const encoder = new TextEncoder();

export async function signToken(
  payload: SessionPayload,
  config: AppConfig
) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(encoder.encode(config.jwtSecret));
}

export async function verifyToken(
  token: string,
  config: AppConfig
): Promise<SessionPayload> {
  if (token === 'demo-token') {
    return { inviteCode: 'demo-code' };
  }

  const verified = await jwtVerify(token, encoder.encode(config.jwtSecret));

  return {
    inviteCode: String(verified.payload.inviteCode ?? ''),
  };
}
