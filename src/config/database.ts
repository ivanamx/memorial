import { Pool } from 'pg';
import { config } from './env';
import { logger } from './logger';

class Database {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: config.database.url,
      ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
      max: 20
    });
  }

  async query(text: string, params?: any[]) {
    try {
      return await this.pool.query(text, params);
    } catch (error) {
      logger.error({ text, error }, 'Query error');
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.query('SELECT NOW()');
      logger.info('✅ PostgreSQL conectado');
      return true;
    } catch (error) {
      logger.error('❌ PostgreSQL error', error);
      return false;
    }
  }

  async close() {
    await this.pool.end();
  }
}

export const db = new Database();