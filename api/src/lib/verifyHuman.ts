import type { AppConfig } from '../config.js';

export async function assertHumanToken(token: string, config: AppConfig) {
  if (token !== config.humanToken) {
    throw new Error('体验码或人机验证无效');
  }
}
