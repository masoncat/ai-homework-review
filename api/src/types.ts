import type { AppConfig } from './config.js';
import type { ObjectStore } from './lib/objectStore.js';
import type { ObjectStoreRuntimeContext } from './lib/objectStore.js';
import type { RateLimitStore } from './lib/rateLimit.js';
import type { TeachingProvider } from './lib/teachingProvider.js';
import type { VisionProvider } from './lib/visionProvider.js';
import type { BatchReviewResult } from '../../shared/types.js';

export type SessionPayload = {
  inviteCode: string;
};

export interface BatchReviewProvider {
  reviewBatch: (
    input: {
      answerPdfObjectKey: string;
      rubricObjectKey: string;
    },
    options?: {
      objectStoreRuntime?: ObjectStoreRuntimeContext;
    }
  ) => Promise<BatchReviewResult>;
}

export type AppBindings = {
  Variables: {
    config: AppConfig;
    visionProvider: VisionProvider;
    teachingProvider: TeachingProvider;
    batchReviewProvider: BatchReviewProvider;
    objectStore: ObjectStore;
    objectStoreRuntimeContext: ObjectStoreRuntimeContext | null;
    rateLimitStore: RateLimitStore;
    session: SessionPayload | null;
  };
};
