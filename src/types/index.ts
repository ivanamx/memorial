export interface Cliente {
  id: number;
  uuid: string;
  nombre_completo: string;
  whatsapp: string;
  ciudad: string;
  requiere_atencion_personal: boolean;
  etapa_actual: string | null;
  bot_pausado: boolean;
  intentos_validacion_telefono: number;
  ultima_actividad_cliente_at: Date | null;
  cerrada_por_inactividad_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Orden {
  id: number;
  uuid: string;
  numero_orden: string;
  cliente_id: number;
  nombre_difunto: string;
  relacion_difunto: string;
  fecha_fallecimiento: Date;
  fecha_nacimiento: Date | null;
  paquete: string;
  servicio_qr: boolean;
  servicio_ingles: boolean;
  servicio_express: boolean;
  precio_base: number;
  precio_servicios_adicionales: number;
  precio_final: number;
  numero_fotos: number;
  tiene_audio_referencia: boolean;
  audio_referencia_url: string | null;
  mensaje_voz_texto: string | null;
  usa_voz_profesional: boolean;
  sin_voz: boolean;
  estilo_musica: string | null;
  estilo_musica_otro: string | null;
  texto_especial: string | null;
  estilo_visual: string | null;
  estado: string;
  fecha_orden: Date;
  fecha_entrega_estimada: Date | null;
  fecha_entrega_real: Date | null;
  url_video_final: string | null;
  aprobado: boolean;
  revision_solicitada: boolean;
  cambios_solicitados: string | null;
  revision_incluida_usada: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Pago {
  id: number;
  orden_id: number;
  monto: number;
  metodo: string;
  estado: string;
  referencia_pago: string | null;
  comprobante_url: string | null;
  fecha_pago: Date | null;
  stripe_checkout_session_id: string | null;
  link_pago: string | null;
  created_at: Date;
}

export interface Archivo {
  id: number;
  orden_id: number;
  nombre_original: string;
  nombre_almacenado: string;
  tipo_archivo: string;
  url_archivo: string;
  created_at: Date;
}

export interface Testimonio {
  id: number;
  cliente_id: number;
  orden_id: number;
  testimonio_texto: string | null;
  testimonio_google: boolean;
  sin_testimonio: boolean;
  created_at: Date;
}