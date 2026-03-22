import { db } from '../config/database';
import { Testimonio } from '../types';
import { logger } from '../config/logger';

export class TestimonioService {
  async create(clienteId: number, ordenId: number, data: {
    testimonioTexto?: string;
    testimonioGoogle?: boolean;
    sinTestimonio?: boolean;
  }): Promise<Testimonio> {
    const result = await db.query(
      `INSERT INTO testimonios (cliente_id, orden_id, testimonio_texto, testimonio_google, sin_testimonio)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [clienteId, ordenId, data.testimonioTexto || null, data.testimonioGoogle || false, data.sinTestimonio || false]
    );
    logger.info({ ordenId }, 'Testimonio creado');
    return result.rows[0] as Testimonio;
  }
}

export const testimonioService = new TestimonioService();