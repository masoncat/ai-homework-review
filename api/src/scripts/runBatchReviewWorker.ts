import { readConfig } from '../config.js';
import { createBatchReviewProvider } from '../lib/batchVisionProvider.js';
import { createBatchReviewRepository } from '../lib/batchReviewRepository.js';
import { initializeBatchReviewSchema } from '../lib/batchReviewSql.js';
import { createBatchReviewWorker } from '../lib/batchReviewWorker.js';
import { createMysqlPool } from '../lib/mysql.js';
import { createObjectStoreFromConfig } from '../lib/objectStore.js';

async function main() {
  const config = readConfig();

  if (!config.mysqlUrl) {
    throw new Error('离线批量批改 worker 需要配置 MYSQL_URL');
  }

  const mysqlPool = createMysqlPool(config.mysqlUrl);
  await initializeBatchReviewSchema(mysqlPool);

  const objectStore = createObjectStoreFromConfig(config);
  const batchReviewProvider = createBatchReviewProvider(config, objectStore);
  const repository = createBatchReviewRepository(mysqlPool);
  const worker = createBatchReviewWorker({
    workerId: config.batchWorkerId,
    repository,
    pollIntervalMs: config.batchWorkerPollIntervalMs,
    reviewBatchPages: async (input, options) =>
      batchReviewProvider.reviewBatch(input, options),
  });

  const abortController = new AbortController();
  process.on('SIGINT', () => abortController.abort());
  process.on('SIGTERM', () => abortController.abort());

  await worker.runForever(abortController.signal);
}

await main();
