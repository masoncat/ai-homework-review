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
  it('creates a mysql pool with UTC-friendly defaults and transaction support', async () => {
    const connection = {
      beginTransaction: vi.fn(async () => undefined),
      execute: vi.fn(async () => [{ affectedRows: 1 }]),
      query: vi.fn(async () => [[{ id: 1 }]]),
      commit: vi.fn(async () => undefined),
      rollback: vi.fn(async () => undefined),
      release: vi.fn(() => undefined),
    };
    const pool = {
      execute: vi.fn(async () => [{ affectedRows: 1 }]),
      query: vi.fn(async () => [[{ id: 1 }]]),
      getConnection: vi.fn(async () => connection),
    };
    createPool.mockReturnValueOnce(pool);

    const result = createMysqlPool('mysql://demo:secret@localhost:3306/app');

    expect(createPool).toHaveBeenCalledWith({
      uri: 'mysql://demo:secret@localhost:3306/app',
      connectionLimit: 10,
      timezone: 'Z',
      dateStrings: true,
    });
    await result.execute('SELECT 1');
    await result.query('SELECT 1');
    const transaction = await result.beginTransaction();
    await transaction.execute('UPDATE task SET status = ?', ['running']);
    await transaction.commit();

    expect(pool.execute).toHaveBeenCalledWith('SELECT 1', undefined);
    expect(pool.query).toHaveBeenCalledWith('SELECT 1', undefined);
    expect(pool.getConnection).toHaveBeenCalledTimes(1);
    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.execute).toHaveBeenCalledWith(
      'UPDATE task SET status = ?',
      ['running']
    );
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('releases the connection on rollback', async () => {
    const connection = {
      beginTransaction: vi.fn(async () => undefined),
      execute: vi.fn(async () => [{ affectedRows: 1 }]),
      query: vi.fn(async () => [[{ id: 1 }]]),
      commit: vi.fn(async () => undefined),
      rollback: vi.fn(async () => undefined),
      release: vi.fn(() => undefined),
    };
    createPool.mockReturnValueOnce({
      execute: vi.fn(),
      query: vi.fn(),
      getConnection: vi.fn(async () => connection),
    });

    const transaction = await createMysqlPool(
      'mysql://demo:secret@localhost:3306/app'
    ).beginTransaction();

    await transaction.rollback();

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
});
