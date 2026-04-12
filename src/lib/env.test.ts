import { describe, expect, it } from 'vitest';
import { getApiBaseUrl, isApiConfigured } from './env';

describe('env', () => {
  it('uses the local api server as the default base url', () => {
    expect(getApiBaseUrl()).toBe('http://localhost:8787');
    expect(isApiConfigured()).toBe(true);
  });
});
