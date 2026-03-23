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
  app.use('/media', express.static(path.join(process.cwd(), 'public', 'media')));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'memoriales-bot' });
  });

  app.get('/', (_req: Request, res: Response) => {
    const canonicalUrl = config.publicUrl.endsWith('/')
      ? config.publicUrl.slice(0, -1)
      : config.publicUrl;

    res.type('html').send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Memoriales Celestiales | Video memorial personalizado en 24 horas</title>
  <meta name="description" content="Honra su memoria con un video memorial personalizado. Entrega en 24 horas. Compra segura y atención por WhatsApp." />
  <meta name="robots" content="index,follow,max-image-preview:large" />
  <link rel="canonical" href="${canonicalUrl}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Memoriales Celestiales | Video memorial personalizado en 24 horas" />
  <meta property="og:description" content="Videos memoriales personalizados con entrega en 24 horas y atención por WhatsApp." />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:site_name" content="Memoriales Celestiales" />
  <meta name="twitter:card" content="summary_large_image" />
  <style>
    :root {
      color-scheme: dark;
      --overlay: rgba(0, 0, 0, 0.62);
      --surface: rgba(18, 18, 20, 0.78);
      --text: #f5f5f7;
      --muted: #d0d0d3;
      --cta: #8c6bff;
      --ctaHover: #9f82ff;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      background: #000;
      color: var(--text);
    }
    .page {
      position: relative;
      width: 100%;
      height: 100dvh;
      display: grid;
      place-items: center;
      padding: 16px;
      isolation: isolate;
    }
    .bgVideo {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      z-index: -3;
    }
    .overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(0deg, var(--overlay), var(--overlay));
      z-index: -2;
    }
    main {
      width: min(100%, 980px);
      background: var(--surface);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 20px;
      padding: 18px;
      backdrop-filter: blur(8px);
      display: grid;
      gap: 14px;
      box-shadow: 0 10px 45px rgba(0, 0, 0, 0.35);
      max-height: calc(100dvh - 32px);
    }
    h1 {
      margin: 0;
      line-height: 1.15;
      font-size: clamp(1.4rem, 2.3vw, 2.4rem);
      text-wrap: balance;
    }
    p {
      margin: 0;
      color: var(--muted);
      font-size: clamp(0.92rem, 1.35vw, 1.06rem);
      line-height: 1.45;
    }
    .videoWrap {
      background: rgba(0, 0, 0, 0.45);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 14px;
      overflow: hidden;
    }
    .videoWrap video {
      width: 100%;
      display: block;
      max-height: min(42dvh, 380px);
      object-fit: cover;
      background: #0a0a0a;
    }
    .actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .cta {
      appearance: none;
      border: 0;
      border-radius: 999px;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 48px;
      padding: 0 20px;
      font-weight: 700;
      color: white;
      background: var(--cta);
      transition: background .2s ease;
    }
    .cta:hover { background: var(--ctaHover); }
    .secondary {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.24);
      color: white;
    }
    .srOnly {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      border: 0;
    }
    @media (max-width: 640px) {
      main {
        border-radius: 16px;
        padding: 14px;
      }
      .actions .cta {
        flex: 1 1 auto;
      }
    }
  </style>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Service",
    "serviceType": "Video memorial personalizado",
    "provider": {
      "@type": "Organization",
      "name": "Memoriales Celestiales",
      "url": "${canonicalUrl}"
    },
    "areaServed": "MX",
    "availableChannel": {
      "@type": "ServiceChannel",
      "serviceUrl": "${canonicalUrl}"
    }
  }
  </script>
</head>
<body>
  <div class="page">
    <video class="bgVideo" autoplay muted loop playsinline preload="metadata" aria-hidden="true">
      <source src="/media/background.webm" type="video/webm" />
      <source src="/media/background.mp4" type="video/mp4" />
    </video>
    <div class="overlay"></div>
    <main>
      <header>
        <h1>Honra su memoria con un video memorial personalizado</h1>
        <p>Entrega en 24 horas. Atención por WhatsApp. Compra segura en pocos minutos.</p>
      </header>

      <section class="videoWrap" aria-labelledby="explicacionTitulo">
        <h2 id="explicacionTitulo" class="srOnly">Video explicativo del servicio</h2>
        <video controls preload="metadata" playsinline poster="/media/poster-explicacion.jpg">
          <source src="/media/explicacion.webm" type="video/webm" />
          <source src="/media/explicacion.mp4" type="video/mp4" />
          Tu navegador no soporta video HTML5.
        </video>
      </section>

      <div class="actions">
        <a class="cta" href="/comprar" aria-label="Comprar ahora">Comprar ahora</a>
        <a class="cta secondary" href="https://wa.me/5210000000000" rel="noopener noreferrer" target="_blank" aria-label="Hablar por WhatsApp">Hablar por WhatsApp</a>
      </div>
    </main>
  </div>
</body>
</html>`);
  });

  app.get('/comprar', (_req: Request, res: Response) => {
    res.type('html').send(`
      <!doctype html>
      <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Comprar | Memoriales Celestiales</title>
      </head>
      <body style="margin:0;min-height:100vh;display:grid;place-items:center;font-family:Inter,system-ui,Segoe UI,Arial,sans-serif;background:#111;color:#fff;">
        <main style="text-align:center;padding:24px;">
          <h1 style="margin:0 0 10px 0;">Página de compra en diseño</h1>
          <p style="margin:0;color:#d0d0d3;">Aquí conectaremos el checkout en la siguiente iteración.</p>
        </main>
      </body>
      </html>
    `);
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
