import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:3000',
  database: {
    url: process.env.DATABASE_URL || '',
    ssl: process.env.DATABASE_SSL === 'true'
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    priceIds: {
      paqueteUnico: process.env.STRIPE_PRICE_ID_PAQUETE_UNICO || '',
      extraQR: process.env.STRIPE_PRICE_ID_EXTRA_QR_LAPIDA || '',
      extraIngles: process.env.STRIPE_PRICE_ID_EXTRA_VERSION_INGLES || '',
      extraExpress: process.env.STRIPE_PRICE_ID_EXTRA_ENTREGA_EXPRESS || ''
    }
  },
  whatsapp: {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    webhookVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
    apiVersion: process.env.WHATSAPP_GRAPH_API_VERSION || 'v23.0'
  },
  bot: {
    inactivityHours: parseInt(process.env.BOT_INACTIVITY_HOURS || '24', 10),
    continueCommand: process.env.BOT_CONTINUE_COMMAND || 'CONTINUAR BOT'
  },
  googleBusinessReviewUrl: process.env.GOOGLE_BUSINESS_REVIEW_URL || '',
  media: {
    storagePath: process.env.MEDIA_STORAGE_PATH || path.join(process.cwd(), 'uploads')
  }
};

export function validateConfig() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL requerido');
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY requerido');
  if (!process.env.WHATSAPP_ACCESS_TOKEN) throw new Error('WHATSAPP_ACCESS_TOKEN requerido');
  if (!process.env.WHATSAPP_PHONE_NUMBER_ID) throw new Error('WHATSAPP_PHONE_NUMBER_ID requerido');
  if (!process.env.WHATSAPP_VERIFY_TOKEN) throw new Error('WHATSAPP_VERIFY_TOKEN requerido');
}