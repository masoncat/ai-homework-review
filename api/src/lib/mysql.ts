import mysql from 'mysql2/promise';

export function createMysqlPool(connectionString: string) {
  return mysql.createPool({
    uri: connectionString,
    connectionLimit: 10,
    timezone: 'Z',
    dateStrings: true,
  });
}
