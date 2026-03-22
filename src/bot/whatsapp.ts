import makeWASocket, { DisconnectReason, useMultiFileAuthState, WASocket, proto, downloadMediaMessage } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import { logger } from '../config/logger';
import { handleIncomingMessage } from './messageHandler';
import { config } from '../config/env';
import { normalizeText } from '../utils/normalizers';

let sock: WASocket | null = null;

export async function initializeWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: logger as any
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 ESCANEA ESTE CÓDIGO QR CON WHATSAPP:\n');
      qrcode.generate(qr, { small: true });
      console.log('\n');
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      
      logger.info({ shouldReconnect }, 'Conexión cerrada');

      if (shouldReconnect) {
        logger.info('Reconectando...');
        setTimeout(() => initializeWhatsApp(), 3000);
      }
    } else if (connection === 'open') {
      logger.info('✅ WhatsApp conectado exitosamente');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const message of messages) {
      if (message.key.remoteJid?.endsWith('@g.us')) continue;
      const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
      if (message.key.fromMe && normalizeText(text) !== normalizeText(config.bot.continueCommand)) continue;
      await handleIncomingMessage(sock!, message);
    }
  });

  return sock;
}

export async function sendTextMessage(to: string, text: string): Promise<void> {
  if (!sock) throw new Error('WhatsApp no está conectado');
  const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
  await sock.sendMessage(jid, { text });
  logger.debug({ to, text: text.substring(0, 50) }, 'Mensaje enviado');
}

export async function downloadMedia(message: proto.IWebMessageInfo): Promise<Buffer | null> {
  try {
    const buffer = await downloadMediaMessage(
      message,
      'buffer',
      {},
      {
        logger: logger as any,
        reuploadRequest: sock!.updateMediaMessage
      }
    );
    return buffer as Buffer;
  } catch (error) {
    logger.error({ error }, 'Error descargando media');
    return null;
  }
}

export function getWhatsAppSocket(): WASocket | null {
  return sock;
}