import { config } from '../config/env';
import fs from 'fs/promises';
import crypto from 'crypto';
import path from 'path';

export function generateUniqueFilename(originalName: string): string {
  const ext = path.extname(originalName);
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  return `${timestamp}-${random}${ext}`;
}

export async function ensureMediaDirectory(): Promise<void> {
  try {
    await fs.access(config.media.storagePath);
  } catch {
    await fs.mkdir(config.media.storagePath, { recursive: true });
  }
}

export function formatPrice(amount: number): string {
  return `$${amount.toFixed(2)} MXN`;
}

export function formatDate(date: Date): string {
  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
  return `${date.getDate()} de ${meses[date.getMonth()]}, ${date.getFullYear()}`;
}

export function calcularFechaEntrega(esExpress: boolean): Date {
  const ahora = new Date();
  const horas = esExpress ? 6 : 24;
  return new Date(ahora.getTime() + horas * 60 * 60 * 1000);
}

export function esInactivo(ultimaActividad: Date | null): boolean {
  if (!ultimaActividad) return false;
  const ahora = new Date();
  const diff = ahora.getTime() - ultimaActividad.getTime();
  const horas = diff / (1000 * 60 * 60);
  return horas >= config.bot.inactivityHours;
}