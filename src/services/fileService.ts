import { db } from '../config/database';
import { Archivo } from '../types';
import { logger } from '../config/logger';
import { config } from '../config/env';
import { generateUniqueFilename, ensureMediaDirectory } from '../utils/helpers';
import fs from 'fs/promises';
import path from 'path';
import mime from 'mime-types';

export class FileService {
  async saveFile(ordenId: number, buffer: Buffer, originalName: string, tipoArchivo: 'foto' | 'audio' | 'video', categoria: string = 'original'): Promise<Archivo> {
    await ensureMediaDirectory();
    const uniqueName = generateUniqueFilename(originalName);
    const filePath = path.join(config.media.storagePath, uniqueName);
    await fs.writeFile(filePath, buffer);

    const result = await db.query(
      `INSERT INTO archivos (orden_id, nombre_original, nombre_almacenado, tipo_archivo, mime_type, extension, url_archivo, almacenamiento_origen, tamano_bytes, categoria)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [ordenId, originalName, uniqueName, tipoArchivo, mime.lookup(originalName) || null, path.extname(originalName), filePath, 'servidor_local', buffer.length, categoria]
    );

    logger.info({ ordenId, filename: uniqueName }, 'Archivo guardado');
    return result.rows[0] as Archivo;
  }

  async contarFotos(ordenId: number): Promise<number> {
    const result = await db.query(
      `SELECT COUNT(*) as count FROM archivos WHERE orden_id = $1 AND tipo_archivo = 'foto' AND deleted_at IS NULL`,
      [ordenId]
    );
    return parseInt(result.rows[0].count);
  }
}

export const fileService = new FileService();