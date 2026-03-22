export function normalizeText(text: string): string {
  return text.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function isAffirmative(text: string): boolean {
  const n = normalizeText(text);
  return ['si', 's', 'ok', 'oka', 'vale', 'claro', 'sip', 'yes'].includes(n);
}

export function isNegative(text: string): boolean {
  const n = normalizeText(text);
  return ['no', 'n', 'nop', 'nel'].includes(n);
}

export function isNoSe(text: string): boolean {
  const n = normalizeText(text);
  return ['no se', 'nose', 'no lo se', 'desconozco'].some(v => n.includes(v));
}

export function isListo(text: string): boolean {
  const n = normalizeText(text);
  return ['listo', 'lista', 'ya'].includes(n);
}

export function isAyuda(text: string): boolean {
  return normalizeText(text) === 'ayuda';
}

export function cleanPhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function isValidPhone(phone: string): boolean {
  const cleaned = cleanPhone(phone);
  return cleaned.length === 10 && /^\d{10}$/.test(cleaned);
}

export function parseServiciosAdicionales(text: string): {
  qr: boolean;
  ingles: boolean;
  express: boolean;
} {
  if (isNegative(text)) return { qr: false, ingles: false, express: false };
  const nums: string[] = text.match(/\d+/g) || [];
  return {
    qr: nums.includes('1'),
    ingles: nums.includes('2'),
    express: nums.includes('3')
  };
}

export function calcularPrecioFinal(servicios: {
  qr: boolean;
  ingles: boolean;
  express: boolean;
}): number {
  let precio = 800;
  if (servicios.qr) precio += 250;
  if (servicios.ingles) precio += 200;
  if (servicios.express) precio += 300;
  return precio;
}

export function parseDate(text: string): Date | null {
  const meses: Record<string, number> = {
    'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3,
    'mayo': 4, 'junio': 5, 'julio': 6, 'agosto': 7,
    'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
  };

  const match1 = text.match(/^(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})$/i);
  if (match1) {
    const dia = parseInt(match1[1]);
    const mes = meses[match1[2].toLowerCase()];
    const anio = parseInt(match1[3]);
    if (mes !== undefined) return new Date(anio, mes, dia);
  }

  const match2 = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match2) {
    return new Date(parseInt(match2[3]), parseInt(match2[2]) - 1, parseInt(match2[1]));
  }

  return null;
}