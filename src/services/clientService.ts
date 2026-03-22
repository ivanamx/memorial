import { db } from '../config/database';
import { Cliente } from '../types';
import { logger } from '../config/logger';

export class ClientService {
  async findOrCreateByWhatsApp(whatsapp: string): Promise<Cliente> {
    const result = await db.query(
      'SELECT * FROM clientes WHERE whatsapp = $1 AND deleted_at IS NULL',
      [whatsapp]
    );

    if (result.rows.length > 0) return result.rows[0] as Cliente;

    const insertResult = await db.query(
      `INSERT INTO clientes (nombre_completo, whatsapp, etapa_actual, ultima_actividad_cliente_at) 
       VALUES ('Pendiente', $1, 'etapa_1_primer_contacto', NOW()) RETURNING *`,
      [whatsapp]
    );

    logger.info({ whatsapp }, 'Nuevo cliente creado');
    return insertResult.rows[0] as Cliente;
  }

  async update(id: number, data: Partial<Cliente>): Promise<Cliente> {
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
    const query = `UPDATE clientes SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
    const result = await db.query(query, values);
    return result.rows[0] as Cliente;
  }

  async updateLastActivity(id: number): Promise<void> {
    await db.query(
      'UPDATE clientes SET ultima_actividad_cliente_at = NOW() WHERE id = $1',
      [id]
    );
  }

  async marcarParaAtencionPersonal(id: number): Promise<void> {
    await db.query(
      `UPDATE clientes SET requiere_atencion_personal = true, bot_pausado = true WHERE id = $1`,
      [id]
    );
    logger.info({ clienteId: id }, 'Cliente marcado para atención personal');
  }

  async reanudarBot(id: number): Promise<void> {
    await db.query(
      `UPDATE clientes SET bot_pausado = false, requiere_atencion_personal = false WHERE id = $1`,
      [id]
    );
    logger.info({ clienteId: id }, 'Bot reanudado');
  }
}

export const clientService = new ClientService();