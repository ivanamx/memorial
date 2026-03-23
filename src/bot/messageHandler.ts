import { logger } from '../config/logger';
import { clientService } from '../services/clientService';
import { orderService } from '../services/orderService';
import { processFlow } from './flowManager';
import { isAyuda, normalizeText } from '../utils/normalizers';
import { sendTextMessage } from './whatsapp';
import { config } from '../config/env';
import { esInactivo } from '../utils/helpers';
import { IncomingWhatsAppMessage } from '../types';

export async function handleIncomingMessage(
  message: IncomingWhatsAppMessage
): Promise<void> {
  try {
    const from = message.from;
    if (!from) return;
    const whatsapp = from.replace('whatsapp:', '');
    const messageText = message.text || '';

    logger.info({ from, text: messageText.substring(0, 100) }, 'Mensaje recibido');

    const cliente = await clientService.findOrCreateByWhatsApp(whatsapp);

    // PRIORIDAD 0: Verificar timeout de 24 horas
    if (cliente.ultima_actividad_cliente_at && !cliente.cerrada_por_inactividad_at) {
      if (esInactivo(cliente.ultima_actividad_cliente_at)) {
        logger.info({ clienteId: cliente.id }, 'Cerrando conversación por inactividad');
        
        const ordenActiva = await orderService.getOrdenActivaByCliente(cliente.id);
        
        if (ordenActiva && ordenActiva.estado === 'borrador') {
          await orderService.eliminarOrdenBorrador(ordenActiva.id);
        }
        
        await clientService.update(cliente.id, {
          cerrada_por_inactividad_at: new Date(),
          etapa_actual: null
        });
        
        await sendTextMessage(
          whatsapp,
          'Cerramos esta conversación por inactividad.\n\nCuando quieras un memorial, escríbenos de nuevo por aquí 🕊️'
        );
        return;
      }
    }

    await clientService.updateLastActivity(cliente.id);

    // PRIORIDAD 1: Detectar AYUDA
    if (isAyuda(messageText)) {
      logger.info({ clienteId: cliente.id }, 'Cliente solicitó AYUDA');
      
      await clientService.marcarParaAtencionPersonal(cliente.id);
      
      await sendTextMessage(
        whatsapp,
        'Listo. Un asesor te atenderá por aquí en un momento.\n\nEscribe con calma lo que necesitas y te respondemos personalmente 🕊️'
      );
      
      return;
    }

    // PRIORIDAD 2: Detectar CONTINUAR BOT
    if (normalizeText(messageText) === normalizeText(config.bot.continueCommand)) {
      logger.info({ clienteId: cliente.id }, 'Asesor reanudó el bot');
      
      await clientService.reanudarBot(cliente.id);
      
      const clienteActualizado = await clientService.findOrCreateByWhatsApp(whatsapp);
      await processFlow(message, clienteActualizado, messageText);
      
      return;
    }

    // PRIORIDAD 3: Si bot está pausado, no procesar
    if (cliente.bot_pausado) {
      logger.info({ clienteId: cliente.id }, 'Bot pausado, mensaje ignorado');
      return;
    }

    // PRIORIDAD 4: Procesar flujo normal
    await processFlow(message, cliente, messageText);

  } catch (error) {
    logger.error({ error }, 'Error en handleIncomingMessage');
  }
}