import type { AppConfig } from './config.js';
import type { BatchReviewProvider } from './lib/batchVisionProvider.js';
import type { BatchReviewTaskStore } from './lib/batchReviewTaskStore.js';
import type { ObjectStore } from './lib/objectStore.js';
import type { ObjectStoreRuntimeContext } from './lib/objectStore.js';
import type { RateLimitStore } from './lib/rateLimit.js';
import type { TeachingProvider } from './lib/teachingProvider.js';
import type { VisionProvider } from './lib/visionProvider.js';

export type SessionPayload = {
  inviteCode: string;
};

export type AppBindings = {
  Variables: {
    config: AppConfig;
    visionProvider: VisionProvider;
    teachingProvider: TeachingProvider;
    batchReviewProvider: BatchReviewProvider;
    batchReviewTaskStore: BatchReviewTaskStore;
    objectStore: ObjectStore;
    objectStoreRuntimeContext: ObjectStoreRuntimeContext | null;
    rateLimitStore: RateLimitStore;
    session: SessionPayload | null;
  };
};
