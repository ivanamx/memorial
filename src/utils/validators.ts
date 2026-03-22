import { isValidPhone, parseDate } from './normalizers';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validateNombreCompleto(nombre: string): string {
  const trimmed = nombre.trim();
  if (trimmed.length < 3) throw new ValidationError('El nombre debe tener al menos 3 caracteres');
  if (trimmed.length > 255) throw new ValidationError('El nombre es demasiado largo');
  return trimmed;
}

export function validateTelefono(telefono: string): string {
  if (!isValidPhone(telefono)) throw new ValidationError('El teléfono debe tener 10 dígitos');
  return telefono.replace(/\D/g, '');
}

export function validateCiudad(ciudad: string): string {
  const trimmed = ciudad.trim();
  if (trimmed.length < 2) throw new ValidationError('La ciudad debe tener al menos 2 caracteres');
  return trimmed;
}

export function validateFecha(fechaText: string): Date {
  const fecha = parseDate(fechaText);
  if (!fecha) throw new ValidationError('Formato de fecha no válido');
  return fecha;
}

export function validateMensajeVoz(texto: string): string {
  const trimmed = texto.trim();
  if (trimmed.length < 10) throw new ValidationError('El mensaje debe tener al menos 10 caracteres');
  if (trimmed.length > 500) throw new ValidationError('El mensaje es demasiado largo (máximo 500 caracteres)');
  return trimmed;
}