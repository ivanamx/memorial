import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import { config } from './config/env';
import { logger } from './config/logger';
import { paymentService } from './services/paymentService';
import { sendTextMessage } from './bot/whatsapp';
import { formatDate } from './utils/helpers';

const stripe = new Stripe(config.stripe.secretKey, { apiVersion: '2023-10-16' });

export function createApp() {
  const app = express();

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'memoriales-bot' });
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
