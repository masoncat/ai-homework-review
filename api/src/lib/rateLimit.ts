export interface RateLimitStore {
  hit(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}

export function createMemoryRateLimitStore(): RateLimitStore {
  const store = new Map<string, number[]>();

  return {
    async hit(key, limit, windowSeconds) {
      const now = Date.now();
      const windowStart = now - windowSeconds * 1000;
      const items = (store.get(key) ?? []).filter((timestamp) => timestamp > windowStart);

      if (items.length >= limit) {
        store.set(key, items);
        return false;
      }

      items.push(now);
      store.set(key, items);
      return true;
    },
  };
}

export async function assertRateLimit(store: RateLimitStore, key: string) {
  const allowed = await store.hit(key, 20, 3600);

  if (!allowed) {
    throw new Error('请求过于频繁，请稍后再试');
  }
}
