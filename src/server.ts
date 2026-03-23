import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import path from 'path';
import { config } from './config/env';
import { logger } from './config/logger';
import { paymentService } from './services/paymentService';
import { sendTextMessage } from './bot/whatsapp';
import { formatDate } from './utils/helpers';
import { handleIncomingMessage } from './bot/messageHandler';
import { IncomingMediaType, IncomingWhatsAppMessage } from './types';

const stripe = new Stripe(config.stripe.secretKey, { apiVersion: '2023-10-16' });
const processedMessageIds = new Set<string>();

type CloudWebhookMessage = {
  from?: string;
  id?: string;
  text?: { body?: string };
  type?: string;
  image?: { id?: string; mime_type?: string };
  audio?: { id?: string; mime_type?: string };
  video?: { id?: string; mime_type?: string };
};

function mapCloudMessageToInternal(message: CloudWebhookMessage): IncomingWhatsAppMessage {
  const mediaTypeMap: Record<string, IncomingMediaType> = {
    image: 'image',
    audio: 'audio',
    video: 'video'
  };
  const mediaType = message.type ? mediaTypeMap[message.type] : undefined;
  const mediaPayload = mediaType ? (message as any)[mediaType] : undefined;
  const media = mediaType && mediaPayload?.id
    ? {
        id: mediaPayload.id,
        type: mediaType,
        mimeType: mediaPayload.mime_type
      }
    : undefined;

  return {
    from: message.from ? `whatsapp:${message.from}` : '',
    fromMe: false,
    messageId: message.id,
    text: message.text?.body || '',
    media
  };
}

export function createApp() {
  const app = express();
  const publicDir = path.join(process.cwd(), 'public');

  // Serve landing static assets (css/js/images/html) from /public.
  app.use(express.static(publicDir));
  app.use('/media', express.static(path.join(process.cwd(), 'public', 'media')));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'memoriales-bot' });
  });

  app.get('/', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.get('/comprar', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicDir, 'comprar.html'));
  });

  app.get('/pago-exitoso', (_req: Request, res: Response) => {
    res.type('html').send(`
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><title>Pago exitoso</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:3rem;">
        <h1>¡Pago recibido!</h1>
        <p>Te notificaremos por WhatsApp cuando tu memorial esté listo.</p>
      </body></html>
    `);
  });

  app.get('/pago-cancelado', (_req: Request, res: Response) => {
    res.type('html').send(`
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><title>Pago cancelado</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:3rem;">
        <h1>Pago cancelado</h1>
        <p>Si cambias de opinión, puedes volver a solicitar el link de pago por WhatsApp.</p>
      </body></html>
    `);
  });

  app.get('/webhook/whatsapp', (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const verifyToken = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (
      mode === 'subscribe' &&
      verifyToken === config.whatsapp.webhookVerifyToken &&
      typeof challenge === 'string'
    ) {
      res.status(200).send(challenge);
      return;
    }

    res.sendStatus(403);
  });

  app.post(
    '/webhook/whatsapp',
    express.json({ type: 'application/json' }),
    async (req: Request, res: Response) => {
      try {
        const body = req.body as any;
        const entries = Array.isArray(body?.entry) ? body.entry : [];

        for (const entry of entries) {
          const changes = Array.isArray(entry?.changes) ? entry.changes : [];
          for (const change of changes) {
            const value = change?.value;
            const messages = Array.isArray(value?.messages) ? value.messages as CloudWebhookMessage[] : [];
            for (const cloudMessage of messages) {
              if (cloudMessage.id && processedMessageIds.has(cloudMessage.id)) {
                continue;
              }

              const internalMessage = mapCloudMessageToInternal(cloudMessage);
              if (!internalMessage.from) continue;

              await handleIncomingMessage(internalMessage);
              if (cloudMessage.id) {
                processedMessageIds.add(cloudMessage.id);
              }
            }
          }
        }

        res.status(200).json({ received: true });
      } catch (error) {
        logger.error({ error }, 'Error procesando webhook de WhatsApp');
        res.status(500).json({ error: 'webhook_error' });
      }
    }
  );

  app.post(
    '/webhook/stripe',
    express.raw({ type: 'application/json' }),
    async (req: Request, res: Response) => {
      const sig = req.headers['stripe-signature'];
      if (!sig || !config.stripe.webhookSecret) {
        logger.warn('Webhook Stripe sin firma o STRIPE_WEBHOOK_SECRET no configurado');
        res.status(400).send('Webhook requires signature');
        return;
      }

      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(
          (req as any).body,
          sig,
          config.stripe.webhookSecret
        );
      } catch (err: any) {
        logger.error({ err }, 'Webhook Stripe: firma inválida');
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status === 'paid') {
          const sessionId = session.id;
          try {
            const result = await paymentService.procesarPagoStripe(sessionId);
            if (result) {
              const fechaEntrega = result.orden.fecha_entrega_estimada
                ? formatDate(new Date(result.orden.fecha_entrega_estimada))
                : 'próximamente';
              const mensaje = `¡Pago recibido! ✅

Tu orden ${result.orden.numero_orden} está confirmada.

Fecha de entrega: ${fechaEntrega}
Te enviaré el video al número WhatsApp registrado.

Seguimos por aquí cuando tengamos avances.
Comenzaremos a trabajar en el memorial con todo el cuidado que merece.

Gracias celestiales.`;

              try {
                await sendTextMessage(result.cliente.whatsapp, mensaje);
                logger.info({ ordenId: result.orden.id }, 'Mensaje de confirmación enviado por WhatsApp');
              } catch (err) {
                logger.error({ err, ordenId: result.orden.id }, 'No se pudo enviar WhatsApp (pago ya registrado)');
              }
            }
          } catch (err) {
            logger.error({ err, sessionId }, 'Error procesando webhook Stripe');
            res.status(500).send('Internal error');
            return;
          }
        }
      } else if (event.type === 'checkout.session.async_payment_succeeded') {
        const session = event.data.object as Stripe.Checkout.Session;
        const sessionId = session.id;
        try {
          const result = await paymentService.procesarPagoStripe(sessionId);
          if (result) {
            const fechaEntrega = result.orden.fecha_entrega_estimada
              ? formatDate(new Date(result.orden.fecha_entrega_estimada))
              : 'próximamente';
            const mensaje = `¡Pago recibido! ✅

Tu orden ${result.orden.numero_orden} está confirmada.

Fecha de entrega: ${fechaEntrega}
Te enviaré el video al número WhatsApp registrado.

Seguimos por aquí cuando tengamos avances.
Comenzaremos a trabajar en el memorial con todo el cuidado que merece.

Gracias celestiales.`;

            try {
              await sendTextMessage(result.cliente.whatsapp, mensaje);
            } catch (err) {
              logger.error({ err }, 'No se pudo enviar WhatsApp (pago ya registrado)');
            }
          }
        } catch (err) {
          logger.error({ err, sessionId }, 'Error procesando pago asíncrono Stripe');
        }
      }

      res.json({ received: true });
    }
  );

  return app;
}
