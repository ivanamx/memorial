import { logger } from '../config/logger';
import { config } from '../config/env';
import { IncomingWhatsAppMessage } from '../types';

function graphApiUrl(path: string): string {
  return `https://graph.facebook.com/${config.whatsapp.apiVersion}${path}`;
}

function normalizeRecipient(to: string): string {
  const withoutPrefix = to.replace('whatsapp:', '').trim();
  return withoutPrefix.startsWith('+')
    ? withoutPrefix
    : `+${withoutPrefix}`;
}

export async function sendTextMessage(to: string, text: string): Promise<void> {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizeRecipient(to),
    type: 'text',
    text: { body: text }
  };

  const response = await fetch(graphApiUrl(`/${config.whatsapp.phoneNumberId}/messages`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.whatsapp.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error({ status: response.status, errorBody }, 'Error enviando mensaje por WhatsApp Cloud API');
    throw new Error('No se pudo enviar mensaje por WhatsApp Cloud API');
  }

  logger.debug({ to, text: text.substring(0, 50) }, 'Mensaje enviado');
}

export async function downloadMedia(message: IncomingWhatsAppMessage): Promise<Buffer | null> {
  const mediaId = message.media?.id;
  if (!mediaId) return null;

  try {
    const mediaInfoResponse = await fetch(graphApiUrl(`/${mediaId}`), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.whatsapp.accessToken}`
      }
    });

    if (!mediaInfoResponse.ok) {
      const errorBody = await mediaInfoResponse.text();
      logger.error({ status: mediaInfoResponse.status, errorBody }, 'Error obteniendo URL de media');
      return null;
    }

    const mediaInfo = await mediaInfoResponse.json() as { url?: string };
    if (!mediaInfo.url) return null;

    const binaryResponse = await fetch(mediaInfo.url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.whatsapp.accessToken}`
      }
    });

    if (!binaryResponse.ok) {
      const errorBody = await binaryResponse.text();
      logger.error({ status: binaryResponse.status, errorBody }, 'Error descargando media');
      return null;
    }

    const arrayBuffer = await binaryResponse.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    logger.error({ error }, 'Error descargando media');
    return null;
  }
}