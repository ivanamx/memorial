import { db } from '../config/database';
import { Orden } from '../types';
import { logger } from '../config/logger';

export class OrderService {
  async create(clienteId: number, data: Partial<Orden>): Promise<Orden> {
    const result = await db.query(
      `INSERT INTO ordenes (cliente_id, nombre_difunto, relacion_difunto, fecha_fallecimiento, fecha_nacimiento, estado)
       VALUES ($1, $2, $3, $4, $5, 'borrador') RETURNING *`,
      [clienteId, data.nombre_difunto, data.relacion_difunto, data.fecha_fallecimiento, data.fecha_nacimiento || null]
    );
    logger.info({ ordenId: result.rows[0].id }, 'Nueva orden creada');
    return result.rows[0] as Orden;
  }

  async getOrdenActivaByCliente(clienteId: number): Promise<Orden | null> {
    const result = await db.query(
      `SELECT * FROM ordenes WHERE cliente_id = $1 
       AND estado IN ('borrador', 'pago_pendiente', 'pago_recibido', 'en_produccion', 'en_revision')
       AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
      [clienteId]
    );
    return result.rows.length > 0 ? (result.rows[0] as Orden) : null;
  }

  async update(id: number, data: Partial<Orden>): Promise<Orden> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id') {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    });

    if (fields.length === 0) throw new Error('No hay campos para actualizar');

    values.push(id);
    const query = `UPDATE ordenes SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
    const result = await db.query(query, values);
    return result.rows[0] as Orden;
  }

  async updateServiciosAdicionales(id: number, servicios: { qr: boolean; ingles: boolean; express: boolean }): Promise<Orden> {
    const result = await db.query(
      `UPDATE ordenes SET servicio_qr = $1, servicio_ingles = $2, servicio_express = $3 WHERE id = $4 RETURNING *`,
      [servicios.qr, servicios.ingles, servicios.express, id]
    );
    return result.rows[0] as Orden;
  }

  async incrementarFotos(id: number): Promise<void> {
    await db.query('UPDATE ordenes SET numero_fotos = numero_fotos + 1 WHERE id = $1', [id]);
  }

  async marcarComoPagada(id: number): Promise<Orden> {
    const result = await db.query(
      `UPDATE ordenes SET estado = 'pago_recibido',
       fecha_entrega_estimada = CASE WHEN servicio_express THEN NOW() + INTERVAL '6 hours'
       ELSE NOW() + INTERVAL '24 hours' END WHERE id = $1 RETURNING *`,
      [id]
    );
    logger.info({ ordenId: id }, 'Orden marcada como pagada');
    return result.rows[0] as Orden;
  }

  async eliminarOrdenBorrador(id: number): Promise<void> {
    await db.query('DELETE FROM pagos WHERE orden_id = $1', [id]);
    await db.query('DELETE FROM testimonios WHERE orden_id = $1', [id]);
    await db.query('DELETE FROM ordenes WHERE id = $1', [id]);
    logger.info({ ordenId: id }, 'Orden borrador eliminada');
  }
}

export const orderService = new OrderService();