import http from 'http';
import { initializeWhatsApp } from './bot/whatsapp';
import { db } from './config/database';
import { logger } from './config/logger';
import { validateConfig, config } from './config/env';
import { ensureMediaDirectory } from './utils/helpers';
import { createApp } from './server';

async function main() {
  try {
    logger.info('🚀 Iniciando bot...');
    validateConfig();
    const ok = await db.testConnection();
    if (!ok) throw new Error('DB error');
    await ensureMediaDirectory();
    await initializeWhatsApp();

    const app = createApp();
    const port = parseInt(process.env.PORT || '3000', 10);
    const server = http.createServer(app);
    server.listen(port, () => {
      logger.info({ port }, `✅ Servidor HTTP en http://localhost:${port}`);
      logger.info(`   Webhook Stripe: POST ${config.publicUrl}/webhook/stripe`);
    });
  } catch (error) {
    logger.error({ error }, 'Error fatal');
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  await db.close();
  process.exit(0);
});

main();