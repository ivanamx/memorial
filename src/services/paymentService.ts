import Stripe from 'stripe';
import { db } from '../config/database';
import { config } from '../config/env';
import { Pago } from '../types';
import { logger } from '../config/logger';

const stripe = new Stripe(config.stripe.secretKey, { apiVersion: '2023-10-16' });

export class PaymentService {
  async createCheckoutSession(ordenId: number, numeroOrden: string, precioFinal: number, servicios: any): Promise<{ url: string; sessionId: string }> {
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      { price: config.stripe.priceIds.paqueteUnico, quantity: 1 }
    ];

    if (servicios.qr) lineItems.push({ price: config.stripe.priceIds.extraQR, quantity: 1 });
    if (servicios.ingles) lineItems.push({ price: config.stripe.priceIds.extraIngles, quantity: 1 });
    if (servicios.express) lineItems.push({ price: config.stripe.priceIds.extraExpress, quantity: 1 });

    const baseUrl = config.publicUrl || 'http://localhost:3000';
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${baseUrl}/pago-exitoso?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pago-cancelado`,
      client_reference_id: numeroOrden,
      metadata: { orden_id: ordenId.toString(), numero_orden: numeroOrden }
    });

    await db.query(
      `INSERT INTO pagos (orden_id, monto, metodo, estado, referencia_pago, link_pago, stripe_checkout_session_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [ordenId, precioFinal, 'tarjeta', 'pendiente', numeroOrden, session.url, session.id]
    );

    logger.info({ ordenId, sessionId: session.id }, 'Sesión de Stripe creada');
    return { url: session.url!, sessionId: session.id };
  }

  async registrarPagoManual(ordenId: number, numeroOrden: string, metodo: 'transferencia' | 'oxxo', comprobanteUrl: string): Promise<Pago> {
    const result = await db.query(
      `INSERT INTO pagos (orden_id, monto, metodo, estado, referencia_pago, comprobante_url, fecha_pago)
       SELECT $1, precio_final, $2, 'completado', $3, $4, NOW() FROM ordenes WHERE id = $1 RETURNING *`,
      [ordenId, metodo, numeroOrden, comprobanteUrl]
    );

    await db.query(`UPDATE ordenes SET estado = 'pago_recibido' WHERE id = $1`, [ordenId]);
    logger.info({ ordenId, metodo }, 'Pago manual registrado');
    return result.rows[0] as Pago;
  }

  /**
   * Procesa pago confirmado por webhook de Stripe.
   * Idempotente: si ya está completado, retorna el dato sin duplicar.
   * @returns { orden, cliente } para enviar WhatsApp, o null si ya procesado / no encontrado
   */
  async procesarPagoStripe(sessionId: string): Promise<{ orden: any; cliente: any } | null> {
    const pagoResult = await db.query(
      `SELECT p.id, p.orden_id, p.estado FROM pagos p 
       WHERE p.stripe_checkout_session_id = $1`,
      [sessionId]
    );
    if (pagoResult.rows.length === 0) {
      logger.warn({ sessionId }, 'Pago no encontrado para sesión Stripe');
      return null;
    }
    const pago = pagoResult.rows[0];
    if (pago.estado === 'completado') {
      logger.info({ sessionId }, 'Pago ya procesado (idempotencia)');
      const ordenCliente = await this.obtenerOrdenYCliente(pago.orden_id);
      return ordenCliente;
    }

    await db.query(
      `UPDATE pagos SET estado = 'completado', fecha_pago = NOW() 
       WHERE stripe_checkout_session_id = $1`,
      [sessionId]
    );
    await db.query(
      `UPDATE ordenes SET estado = 'pago_recibido', 
        fecha_entrega_estimada = CASE WHEN servicio_express THEN NOW() + INTERVAL '6 hours' ELSE NOW() + INTERVAL '24 hours' END 
       WHERE id = $1`,
      [pago.orden_id]
    );
    await db.query(
      `UPDATE clientes SET etapa_actual = 'orden_confirmada' 
       WHERE id = (SELECT cliente_id FROM ordenes WHERE id = $1)`,
      [pago.orden_id]
    );

    logger.info({ ordenId: pago.orden_id, sessionId }, 'Pago Stripe procesado');
    return this.obtenerOrdenYCliente(pago.orden_id);
  }

  private async obtenerOrdenYCliente(ordenId: number): Promise<{ orden: any; cliente: any } | null> {
    const result = await db.query(
      `SELECT o.*, c.whatsapp, c.nombre_completo 
       FROM ordenes o 
       JOIN clientes c ON o.cliente_id = c.id 
       WHERE o.id = $1`,
      [ordenId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      orden: {
        id: row.id,
        numero_orden: row.numero_orden,
        nombre_difunto: row.nombre_difunto,
        fecha_entrega_estimada: row.fecha_entrega_estimada
      },
      cliente: { whatsapp: row.whatsapp, nombre_completo: row.nombre_completo }
    };
  }
}

export const paymentService = new PaymentService();