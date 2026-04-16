import type { BatchReviewTaskSnapshot } from '../../../shared/types.js';
import type {
  ObjectStore,
  ObjectStoreRuntimeContext,
} from './objectStore.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const TASK_PREFIX = 'uploads/system/batch-review-tasks';

export interface BatchReviewTaskStore {
  saveTask: (
    task: BatchReviewTaskSnapshot,
    runtime?: ObjectStoreRuntimeContext
  ) => Promise<void>;
  getTask: (
    taskId: string,
    runtime?: ObjectStoreRuntimeContext
  ) => Promise<BatchReviewTaskSnapshot | null>;
}

function getTaskObjectKey(taskId: string) {
  return `${TASK_PREFIX}/${taskId}.json`;
}

function requireTaskStoreObjectStore(objectStore: ObjectStore) {
  if (!objectStore.saveObject || !objectStore.getObjectBytes) {
    return null;
  }

  return {
    saveObject: objectStore.saveObject,
    getObjectBytes: objectStore.getObjectBytes,
  };
}

function isMissingTaskError(error: unknown) {
  return (
    error instanceof Error &&
    /未找到|NoSuchKey|not found|404/i.test(error.message)
  );
}

export function createBatchReviewTaskStore(
  objectStore: ObjectStore
): BatchReviewTaskStore {
  const taskStoreObjectStore = requireTaskStoreObjectStore(objectStore);
  const memoryStore = new Map<string, BatchReviewTaskSnapshot>();

  if (!taskStoreObjectStore) {
    return {
      async saveTask(task) {
        memoryStore.set(task.taskId, task);
      },
      async getTask(taskId) {
        return memoryStore.get(taskId) ?? null;
      },
    };
  }

  return {
    async saveTask(task, runtime) {
      await taskStoreObjectStore.saveObject(
        getTaskObjectKey(task.taskId),
        encoder.encode(JSON.stringify(task)),
        'application/json',
        runtime
      );
    },
    async getTask(taskId, runtime) {
      try {
        const bytes = await taskStoreObjectStore.getObjectBytes(
          getTaskObjectKey(taskId),
          runtime
        );

        return JSON.parse(decoder.decode(bytes)) as BatchReviewTaskSnapshot;
      } catch (error) {
        if (isMissingTaskError(error)) {
          return null;
        }

        throw error;
      }
    },
  };
}
