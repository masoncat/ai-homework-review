import { describe, expect, it } from 'vitest';

import { readConfig } from './config.js';

describe('readConfig', () => {
  it('reads offline batch execution config', () => {
    const config = readConfig({
      BATCH_REVIEW_EXECUTION_MODE: 'offline',
      MYSQL_URL: 'mysql://user:pass@127.0.0.1:3306/ai_homework_review',
      BATCH_WORKER_ID: 'worker-1',
      BATCH_WORKER_POLL_INTERVAL_MS: '1500',
      BATCH_REVIEW_TASK_LOOKBACK_DAYS: '7',
    } as NodeJS.ProcessEnv);

    expect(config.batchReviewExecutionMode).toBe('offline');
    expect(config.mysqlUrl).toContain('ai_homework_review');
    expect(config.batchWorkerId).toBe('worker-1');
    expect(config.batchWorkerPollIntervalMs).toBe(1500);
    expect(config.batchReviewTaskLookbackDays).toBe(7);
  });

  it('defaults batch execution mode to inline and uses default worker numbers', () => {
    const config = readConfig({} as NodeJS.ProcessEnv);

    expect(config.batchReviewExecutionMode).toBe('inline');
    expect(config.batchWorkerPollIntervalMs).toBe(1500);
    expect(config.batchReviewTaskLookbackDays).toBe(7);
  });

  it('falls back to default worker numbers when env values are malformed', () => {
    const config = readConfig({
      BATCH_WORKER_POLL_INTERVAL_MS: 'not-a-number',
      BATCH_REVIEW_TASK_LOOKBACK_DAYS: 'bad-value',
    } as NodeJS.ProcessEnv);

    expect(config.batchWorkerPollIntervalMs).toBe(1500);
    expect(config.batchReviewTaskLookbackDays).toBe(7);
  });

  it('falls back to default worker numbers when env values are blank', () => {
    const config = readConfig({
      BATCH_WORKER_POLL_INTERVAL_MS: '',
      BATCH_REVIEW_TASK_LOOKBACK_DAYS: '   ',
    } as NodeJS.ProcessEnv);

    expect(config.batchWorkerPollIntervalMs).toBe(1500);
    expect(config.batchReviewTaskLookbackDays).toBe(7);
  });
});
