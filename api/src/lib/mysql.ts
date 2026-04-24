import mysql from 'mysql2/promise';

export function createMysqlPool(connectionString: string) {
  const pool = mysql.createPool({
    uri: connectionString,
    connectionLimit: 10,
    timezone: 'Z',
    dateStrings: true,
  });

  return {
    execute(sql: string, params?: unknown[]) {
      return pool.execute(sql, params as never);
    },
    query(sql: string, params?: unknown[]) {
      return pool.query(sql, params as never);
    },
    async beginTransaction() {
      const connection = await pool.getConnection();
      await connection.beginTransaction();

      return {
        execute(sql: string, params?: unknown[]) {
          return connection.execute(sql, params as never);
        },
        query(sql: string, params?: unknown[]) {
          return connection.query(sql, params as never);
        },
        async commit() {
          try {
            await connection.commit();
          } finally {
            connection.release();
          }
        },
        async rollback() {
          try {
            await connection.rollback();
          } finally {
            connection.release();
          }
        },
      };
    },
  };
}
