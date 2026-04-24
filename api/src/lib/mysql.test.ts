import { describe, expect, it, vi } from 'vitest';

const { createPool } = vi.hoisted(() => ({
  createPool: vi.fn(),
}));

vi.mock('mysql2/promise', () => ({
  default: {
    createPool,
  },
}));

import { createMysqlPool } from './mysql.js';

describe('createMysqlPool', () => {
  it('creates a mysql pool with UTC-friendly defaults', () => {
    const pool = { kind: 'mock-pool' };
    createPool.mockReturnValueOnce(pool);

    const result = createMysqlPool('mysql://demo:secret@localhost:3306/app');

    expect(createPool).toHaveBeenCalledWith({
      uri: 'mysql://demo:secret@localhost:3306/app',
      connectionLimit: 10,
      timezone: 'Z',
      dateStrings: true,
    });
    expect(result).toBe(pool);
  });
});
