import { proto, WASocket } from '@whiskeysockets/baileys';
import { Cliente, Orden } from '../types';
import { logger } from '../config/logger';
import { clientService } from '../services/clientService';
import { orderService } from '../services/orderService';
import { paymentService } from '../services/paymentService';
import { fileService } from '../services/fileService';
import { testimonioService } from '../services/testimonioService';
import { sendTextMessage, downloadMedia } from './whatsapp';
import { db } from '../config/database';
import {
  isAffirmative,
  isNegative,
  isNoSe,
  isListo,
  normalizeText,
  parseServiciosAdicionales
} from '../utils/normalizers';
import {
  validateNombreCompleto,
  validateTelefono,
  validateCiudad,
  validateFecha,
  validateMensajeVoz,
  ValidationError
} from '../utils/validators';
import { formatDate, formatPrice } from '../utils/helpers';
import { config } from '../config/env';

export async function processFlow(
  sock: WASocket,
  message: proto.IWebMessageInfo,
  cliente: Cliente,
  messageText: string
): Promise<void> {
  const whatsapp = message.key.remoteJid!.replace('@s.whatsapp.net', '');
  const etapa = cliente.etapa_actual || 'etapa_1_primer_contacto';

  logger.debug({ clienteId: cliente.id, etapa }, 'Procesando etapa');

  try {
    switch (etapa) {
      case 'etapa_1_primer_contacto':
      case 'esperando_si_no_inicial':
        await handleEtapa1(whatsapp, cliente, messageText);
        break;
      
      case 'pregunta_1_nombre':
        await handlePregunta1Nombre(whatsapp, cliente, messageText);
        break;
      
      case 'pregunta_2_telefono':
        await handlePregunta2Telefono(whatsapp, cliente, messageText);
        break;
      
      case 'pregunta_3_ciudad':
        await handlePregunta3Ciudad(whatsapp, cliente, messageText);
        break;
      
      case 'pregunta_4_nombre_difunto':
        await handlePregunta4NombreDifunto(whatsapp, cliente, messageText);
        break;
      
      case 'pregunta_5_relacion':
        await handlePregunta5Relacion(whatsapp, cliente, messageText);
        break;
      
      case 'pregunta_6_fecha_fallecimiento':
        await handlePregunta6FechaFallecimiento(whatsapp, cliente, messageText);
        break;
      
      case 'pregunta_7_fecha_nacimiento':
        await handlePregunta7FechaNacimiento(whatsapp, cliente, messageText);
        break;
      
      case 'pregunta_8_servicios_adicionales':
        await handlePregunta8ServiciosAdicionales(whatsapp, cliente, messageText);
        break;
      
      case 'pregunta_9_fotos':
        await handlePregunta9Fotos(whatsapp, cliente, message);
        break;
      
      case 'pregunta_10_audio_referencia':
        await handlePregunta10AudioReferencia(whatsapp, cliente, messageText);
        break;
      
      case 'esperando_audio':
        await handleEsperandoAudio(whatsapp, cliente, message);
        break;
      
      case 'pregunta_11_mensaje_voz':
        await handlePregunta11MensajeVoz(whatsapp, cliente, messageText);
        break;
      
      case 'opcion_sin_audio':
        await handleOpcionSinAudio(whatsapp, cliente, messageText);
        break;
      
      case 'pregunta_12_musica':
        await handlePregunta12Musica(whatsapp, cliente, messageText);
        break;
      
      case 'pregunta_13_texto_especial':
        await handlePregunta13TextoEspecial(whatsapp, cliente, messageText);
        break;
      
      case 'pregunta_14_estilo_visual':
        await handlePregunta14EstiloVisual(whatsapp, cliente, messageText);
        break;
      
      case 'confirmacion_resumen':
        await handleConfirmacionResumen(whatsapp, cliente, messageText);
        break;
      
      case 'pregunta_15_metodo_pago':
        await handlePregunta15MetodoPago(whatsapp, cliente, messageText);
        break;
      
      case 'esperando_comprobante':
        await handleEsperandoComprobante(whatsapp, cliente, message);
        break;
      
      case 'esperando_pago_stripe':
        await handleEsperandoPagoStripe(whatsapp, cliente, messageText);
        break;
      
      case 'revision_video':
        await handleRevisionVideo(whatsapp, cliente, messageText);
        break;
      
      case 'esperando_cambios':
        await handleEsperandoCambios(whatsapp, cliente, messageText);
        break;
      
      case 'confirmar_revision_adicional':
        await handleConfirmarRevisionAdicional(whatsapp, cliente, messageText);
        break;
      
      case 'pregunta_testimonio':
        await handlePreguntaTestimonio(whatsapp, cliente, messageText);
        break;
      
      case 'esperando_testimonio_texto':
        await handleEsperandoTestimonioTexto(whatsapp, cliente, messageText);
        break;
      
      case 'confirmar_publicacion_testimonio':
        await handleConfirmarPublicacionTestimonio(whatsapp, cliente, messageText);
        break;
      
      case 'flujo_completado':
        logger.info({ clienteId: cliente.id }, 'Cliente con flujo completado envió mensaje');
        break;
      
      default:
        logger.warn({ etapa }, 'Etapa desconocida');
        await sendTextMessage(whatsapp, 'Hubo un error. Un asesor te contactará pronto.');
        await clientService.marcarParaAtencionPersonal(cliente.id);
    }
  } catch (error) {
    logger.error({ error, etapa }, 'Error procesando flujo');
    await sendTextMessage(whatsapp, 'Ocurrió un error. Un asesor te atenderá en breve 🕊️');
    await clientService.marcarParaAtencionPersonal(cliente.id);
  }
}

// ============================================================
// ETAPA 1: PRIMER CONTACTO
// ============================================================

async function handleEtapa1(
  whatsapp: string,
  cliente: Cliente,
  messageText: string
): Promise<void> {
  if (!messageText || !cliente.etapa_actual || cliente.etapa_actual === 'etapa_1_primer_contacto') {
    await sendTextMessage(
      whatsapp,
      'Hola! Gracias por contactar a Memoriales Celestiales 🕊️\n\nCreamos videos memoriales hermosos con IA que preservan la memoria de tus seres queridos para siempre.\n\nCompra en 5 minutos. Si en algún momento necesitas ayuda, escribe la palabra ayuda (ayuda, Ayuda, AYUDA, como prefieras) y te atenderemos personalmente.\nContesta estas preguntas, paga y recibe.\n\nResponde SI o NO para continuar o salir (cualquier formato: sí, Sí, si, NO, no, etc.).'
    );
    
    await clientService.update(cliente.id, {
      etapa_actual: 'esperando_si_no_inicial'
    });
    
    return;
  }

  if (isAffirmative(messageText)) {
    await clientService.update(cliente.id, {
      etapa_actual: 'pregunta_1_nombre'
    });
    
    await sendTextMessage(
      whatsapp,
      'Perfecto! Empecemos\n\n1️⃣ ¿Cuál es tu nombre completo?'
    );
  } else if (isNegative(messageText)) {
    await clientService.update(cliente.id, {
      requiere_atencion_personal: true,
      bot_pausado: true,
      etapa_actual: 'salida_inicial'
    });
    
    await sendTextMessage(
      whatsapp,
      'Entendido, gracias por escribirnos.\n\nSi más adelante deseas un memorial o tienes dudas, aquí estaremos. Que tengas un buen día 🕊️'
    );
  } else {
    await sendTextMessage(
      whatsapp,
      'Por favor responde SI para continuar o NO para salir.'
    );
  }
}

// ============================================================
// PREGUNTA 1: NOMBRE
// ============================================================

async function handlePregunta1Nombre(
  whatsapp: string,
  cliente: Cliente,
  messageText: string
): Promise<void> {
  try {
    const nombreCompleto = validateNombreCompleto(messageText);
    
    await clientService.update(cliente.id, {
      nombre_completo: nombreCompleto,
      etapa_actual: 'pregunta_2_telefono'
    });
    
    const primerNombre = nombreCompleto.split(' ')[0];
    
    await sendTextMessage(
      whatsapp,
      `Mucho gusto, ${primerNombre}.\n\n2️⃣ Confirma tu número de teléfono con WhatsApp. (ej.7221234567)`
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      await sendTextMessage(whatsapp, error.message + '\n\nPor favor escribe tu nombre completo:');
    } else {
      throw error;
    }
  }
}

// ============================================================
// PREGUNTA 2: TELÉFONO
// ============================================================

async function handlePregunta2Telefono(
  whatsapp: string,
  cliente: Cliente,
  messageText: string
): Promise<void> {
  try {
    const telefonoLimpio = validateTelefono(messageText);
    
    await clientService.update(cliente.id, {
      whatsapp: telefonoLimpio,
      intentos_validacion_telefono: 0,
      etapa_actual: 'pregunta_3_ciudad'
    });
    
    await sendTextMessage(
      whatsapp,
      'Perfecto!\n\n3️⃣ ¿En qué ciudad te encuentras?'
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      const intentos = (cliente.intentos_validacion_telefono || 0) + 1;
      
      if (intentos >= 3) {
        await clientService.update(cliente.id, {
          requiere_atencion_personal: true,
          bot_pausado: true,
          intentos_validacion_telefono: intentos
        });
        
        await sendTextMessage(
          whatsapp,
          'No logramos validar el número automáticamente.\n\nUn asesor te escribirá en breve por este chat para ayudarte. Gracias por tu paciencia 🕊️'
        );
      } else {
        await clientService.update(cliente.id, {
          intentos_validacion_telefono: intentos
        });
        
        await sendTextMessage(
          whatsapp,
          'El número debe tener 10 dígitos (solo números). Ejemplos válidos: 7221234567 o 722-123-4567.\n\n2️⃣ Por favor confirma tu número otra vez:'
        );
      }
    } else {
      throw error;
    }
  }
}

// ============================================================
// PREGUNTA 3: CIUDAD
// ============================================================

async function handlePregunta3Ciudad(
  whatsapp: string,
  cliente: Cliente,
  messageText: string
): Promise<void> {
  try {
    const ciudad = validateCiudad(messageText);
    
    await clientService.update(cliente.id, {
      ciudad: ciudad,
      etapa_actual: 'pregunta_4_nombre_difunto'
    });
    
    const primerNombre = cliente.nombre_completo?.split(' ')[0] || '';
    
    await sendTextMessage(
      whatsapp,
      `Gracias, ${primerNombre}.\n\nAhora, cuéntame sobre la persona a quien quieres honrar:\n\n4️⃣ ¿Cuál era su nombre completo?`
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      await sendTextMessage(whatsapp, error.message + '\n\nPor favor escribe tu ciudad:');
    } else {
      throw error;
    }
  }
}

// ============================================================
// PREGUNTA 4: NOMBRE DEL DIFUNTO
// ============================================================

async function handlePregunta4NombreDifunto(
  whatsapp: string,
  cliente: Cliente,
  messageText: string
): Promise<void> {
  try {
    const nombreDifunto = validateNombreCompleto(messageText);
    
    await orderService.create(cliente.id, {
      nombre_difunto: nombreDifunto,
      relacion_difunto: '',
      fecha_fallecimiento: new Date(),
      estado: 'borrador'
    });
    
    await clientService.update(cliente.id, {
      etapa_actual: 'pregunta_5_relacion'
    });
    
    await sendTextMessage(
      whatsapp,
      '5️⃣ ¿Qué relación tenía contigo?\n(Ejemplo: madre, padre, esposo/a, hijo/a, abuelo/a, hermano/a, amigo/a)'
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      await sendTextMessage(whatsapp, error.message + '\n\nPor favor escribe el nombre completo:');
    } else {
      throw error;
    }
  }
}

// ============================================================
// PREGUNTA 5: RELACIÓN
// ============================================================

async function handlePregunta5Relacion(
  whatsapp: string,
  cliente: Cliente,
  messageText: string
): Promise<void> {
  const relacion = messageText.trim().toLowerCase();
  
  const orden = await orderService.getOrdenActivaByCliente(cliente.id);
  if (!orden) throw new Error('No se encontró orden activa');
  
  await orderService.update(orden.id, {
    relacion_difunto: relacion
  });
  
  await clientService.update(cliente.id, {
    etapa_actual: 'pregunta_6_fecha_fallecimiento'
  });
  
  await sendTextMessage(
    whatsapp,
    'Lamento mucho tu pérdida.\n\n6️⃣ ¿Cuándo falleció?'
  );
}

// ============================================================
// PREGUNTA 6: FECHA DE FALLECIMIENTO
// ============================================================

async function handlePregunta6FechaFallecimiento(
  whatsapp: string,
  cliente: Cliente,
  messageText: string
): Promise<void> {
  try {
    const fecha = validateFecha(messageText);
    
    const orden = await orderService.getOrdenActivaByCliente(cliente.id);
    if (!orden) throw new Error('No se encontró orden activa');
    
    await orderService.update(orden.id, {
      fecha_fallecimiento: fecha
    });
    
    await clientService.update(cliente.id, {
      etapa_actual: 'pregunta_7_fecha_nacimiento'
    });
    
    await sendTextMessage(
      whatsapp,
      '7️⃣ ¿Cuándo nació? (escribe "NO SE" si no tienes este dato)'
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      await sendTextMessage(
        whatsapp,
        'No pude entender la fecha. Por favor escríbela en alguno de estos formatos:\n• 15 de marzo de 2026\n• 15/03/2026\n• 15-03-2026'
      );
    } else {
      throw error;
    }
  }
}

// ============================================================
// PREGUNTA 7: FECHA DE NACIMIENTO
// ============================================================

async function handlePregunta7FechaNacimiento(
  whatsapp: string,
  cliente: Cliente,
  messageText: string
): Promise<void> {
  const orden = await orderService.getOrdenActivaByCliente(cliente.id);
  if (!orden) throw new Error('No se encontró orden activa');
  
  if (isNoSe(messageText)) {
    await orderService.update(orden.id, {
      fecha_nacimiento: null
    });
  } else {
    try {
      const fecha = validateFecha(messageText);
      await orderService.update(orden.id, {
        fecha_nacimiento: fecha
      });
    } catch (error) {
      if (error instanceof ValidationError) {
        await sendTextMessage(
          whatsapp,
          'No pude entender la fecha. Escribe "NO SE" si no la tienes, o escríbela en formato: 5 de mayo de 1950'
        );
        return;
      }
      throw error;
    }
  }
  
  await clientService.update(cliente.id, {
    etapa_actual: 'pregunta_8_servicios_adicionales'
  });
  
  await sendTextMessage(
    whatsapp,
    'Gracias por compartir esto conmigo.\n\nTenemos un paquete único:\n\nPAQUETE ÚNICO: $800 MXN\n-----------------------\n✓ Video memorial 4-5 minutos\n✓ Hasta 15 fotos restauradas con AI\n✓ Música personalizada\n✓ Narración profesional de oraciones seleccionadas\n✓ 1 foto hablando (mensaje 20 seg)\n✓ Voz clonada si hay audio\n✓ Entrega en 24 horas\n✓ 1 revisión incluida\n✓ Versión HD + versión WhatsApp\n\nSERVICIOS ADICIONALES:\n---------------------\n1. Código QR para lápida: +$250\n2. Versión en inglés: +$200\n3. Entrega express (6 horas): +$300\n\n8️⃣ Todo esto incluye el paquete. ¿Ocupas algún servicio adicional?\n(Responde: NO, para continuar sin servicios adicionales, en caso de ocupar alguno responde con el número(s) del servicio adicional)'
  );
}

// ============================================================
// PREGUNTA 8: SERVICIOS ADICIONALES
// ============================================================

async function handlePregunta8ServiciosAdicionales(
  whatsapp: string,
  cliente: Cliente,
  messageText: string
): Promise<void> {
  const servicios = parseServiciosAdicionales(messageText);
  
  const orden = await orderService.getOrdenActivaByCliente(cliente.id);
  if (!orden) throw new Error('No se encontró orden activa');
  
  await orderService.updateServiciosAdicionales(orden.id, servicios);
  
  await clientService.update(cliente.id, {
    etapa_actual: 'pregunta_9_fotos'
  });
  
  await sendTextMessage(
    whatsapp,
    'Perfecto!\n\n9️⃣ Por favor, envíame hasta 15 fotos una por una o en grupos.\n\nPueden ser:\n• Fotos antiguas (las restauramos)\n• Fotos recientes\n• Fotos de diferentes etapas de su vida\n\nTómate tu tiempo. Cuando termines, escribe "LISTO" ✅'
  );
}

// ============================================================
// PREGUNTA 9: FOTOS
// ============================================================

async function handlePregunta9Fotos(
  whatsapp: string,
  cliente: Cliente,
  message: proto.IWebMessageInfo
): Promise<void> {
  const messageText = message.message?.conversation ||
                     message.message?.extendedTextMessage?.text ||
                     '';
  
  if (isListo(messageText)) {
    const orden = await orderService.getOrdenActivaByCliente(cliente.id);
    if (!orden) throw new Error('No se encontró orden activa');
    
    const numFotos = await fileService.contarFotos(orden.id);
    
    if (numFotos === 0) {
      await sendTextMessage(
        whatsapp,
        'Aún no recibimos fotos. Necesitamos al menos 1 para armar el memorial.\n\nPor favor envía tus fotos (hasta 15). Cuando termines, escribe LISTO.'
      );
      return;
    }
    
    await clientService.update(cliente.id, {
      etapa_actual: 'pregunta_10_audio_referencia'
    });
    
    await sendTextMessage(
      whatsapp,
      `Gracias por las fotos. Las vamos a tratar con mucho cuidado.\n\nAhora viene la parte especial: el mensaje hablado.\n\n1️⃣0️⃣ ¿Tienes algún audio o video donde se escuche la voz de ${orden.relacion_difunto}?\n\nPuede ser:\n• Un mensaje de voz de WhatsApp\n• Un video corto\n• Una grabación de teléfono\n• Cualquier audio donde hable\n\nNecesitamos de 10 a 20 segundos de audio claro.\n\n¿Tienes algo así? (SÍ/NO)`
    );
    
    return;
  }
  
  const imageMessage = message.message?.imageMessage;
  
  if (imageMessage) {
    const orden = await orderService.getOrdenActivaByCliente(cliente.id);
    if (!orden) throw new Error('No se encontró orden activa');
    
    const numFotos = await fileService.contarFotos(orden.id);
    
    if (numFotos >= 15) {
      await sendTextMessage(
        whatsapp,
        'Ya recibimos 15 fotos, que es el máximo incluido en tu paquete.\n\nCuando estés conforme con las 15 fotos, escribe LISTO.'
      );
      return;
    }
    
    const buffer = await downloadMedia(message);
    if (!buffer) {
      await sendTextMessage(whatsapp, 'No pude descargar la foto. Por favor envíala de nuevo.');
      return;
    }
    
    const filename = `foto_${Date.now()}.jpg`;
    await fileService.saveFile(orden.id, buffer, filename, 'foto', 'original');
    await orderService.incrementarFotos(orden.id);
    
    logger.info({ ordenId: orden.id, numFotos: numFotos + 1 }, 'Foto recibida');
  }
}

// ============================================================
// PREGUNTA 10: AUDIO DE REFERENCIA
// ============================================================

async function handlePregunta10AudioReferencia(
  whatsapp: string,
  cliente: Cliente,
  messageText: string
): Promise<void> {
  if (isAffirmative(messageText)) {
    await clientService.update(cliente.id, {
      etapa_actual: 'esperando_audio'
    });
    
    await sendTextMessage(
      whatsapp,
      '¡Perfecto!\n\nPor favor envíame el video o audio donde se escuche su voz más clara.\n\nEntre más claro el audio, mejor será el resultado.'
    );
  } else if (isNegative(messageText)) {
    await clientService.update(cliente.id, {
      etapa_actual: 'opcion_sin_audio'
    });
    
    await sendTextMessage(
      whatsapp,
      'No te preocupes!\n\nTenemos 2 opciones:\n\nA) Usamos una voz femenina/masculina profesional similar a su edad\n\nB) Hacemos el video sin voz, solo con música y texto en pantalla\n\n¿Qué prefieres? (A o B)'
    );
  } else {
    await sendTextMessage(
      whatsapp,
      'Por favor responde SÍ si tienes audio, o NO si no tienes.'
    );
  }
}

// ============================================================
// ESPERANDO AUDIO
// ============================================================

async function handleEsperandoAudio(
  whatsapp: string,
  cliente: Cliente,
  message: proto.IWebMessageInfo
): Promise<void> {
  const audioMessage = message.message?.audioMessage;
  const videoMessage = message.message?.videoMessage;
  
  if (!audioMessage && !videoMessage) {
    await sendTextMessage(
      whatsapp,
      'Por favor envía un audio o video donde se escuche la voz.'
    );
    return;
  }
  
  const buffer = await downloadMedia(message);
  if (!buffer) {
    await sendTextMessage(whatsapp, 'No pude descargar el archivo. Por favor envíalo de nuevo.');
    return;
  }
  
  const orden = await orderService.getOrdenActivaByCliente(cliente.id);
  if (!orden) throw new Error('No se encontró orden activa');
  
  const tipoArchivo = audioMessage ? 'audio' : 'video';
  const filename = `audio_ref_${Date.now()}.${audioMessage ? 'ogg' : 'mp4'}`;
  const archivo = await fileService.saveFile(orden.id, buffer, filename, tipoArchivo, 'audio_referencia');
  
  await orderService.update(orden.id, {
    tiene_audio_referencia: true,
    audio_referencia_url: archivo.url_archivo
  });
  
  await clientService.update(cliente.id, {
    etapa_actual: 'pregunta_11_mensaje_voz'
  });
  
  await sendTextMessage(
    whatsapp,
    `Recibido!\n\n1️⃣1️⃣ Ahora, ¿qué mensaje te gustaría que ${orden.relacion_difunto} dijera en el video?\n\nPuede ser:\n• Un mensaje de despedida\n• Palabras de amor para la familia\n• Un consejo que solía dar\n• Lo que tú quieras escuchar\n\nEscribe el mensaje completo (máximo 20 segundos de lectura):`
  );
}

// ============================================================
// PREGUNTA 11: MENSAJE DE VOZ
// ============================================================

async function handlePregunta11MensajeVoz(
  whatsapp: string,
  cliente: Cliente,
  messageText: string
): Promise<void> {
  try {
    const mensajeVoz = validateMensajeVoz(messageText);
    
    const orden = await orderService.getOrdenActivaByCliente(cliente.id);
    if (!orden) throw new Error('No se encontró orden activa');
    
    await orderService.update(orden.id, {
      mensaje_voz_texto: mensajeVoz
    });
    
    await clientService.update(cliente.id, {
      etapa_actual: 'pregunta_12_musica'
    });
    
    await sendTextMessage(
      whatsapp,
      'Perfecto! 🎵\n\n1️⃣2️⃣ ¿Qué estilo de música prefieres?\n\n1. Música clásica celestial (Ave María, etc.)\n2. Música instrumental suave (piano, violín)\n3. Música religiosa (católica/cristiana)\nOtra, (dime cual)\n\nResponde con el número o descríbeme el estilo.'
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      await sendTextMessage(whatsapp, error.message + '\n\nPor favor escribe el mensaje de nuevo:');
    } else {
      throw error;
    }
  }
}

// ============================================================
// OPCIÓN SIN AUDIO
// ============================================================

async function handleOpcionSinAudio(
  whatsapp: string,
  cliente: Cliente,
  messageText: string
): Promise<void> {
  const opcion = normalizeText(messageText);
  
  const orden = await orderService.getOrdenActivaByCliente(cliente.id);
  if (!orden) throw new Error('No se encontró orden activa');
  
  if (opcion === 'a') {
    await orderService.update(orden.id, {
      tiene_audio_referencia: false,
      usa_voz_profesional: true,
      sin_voz: false
    });
    
    await clientService.update(cliente.id, {
      etapa_actual: 'pregunta_11_mensaje_voz'
    });
    
    await sendTextMessage(
      whatsapp,
      `1️⃣1️⃣ ¿Qué mensaje te gustaría que dijera en el video?\n\nPuede ser:\n• Un mensaje de despedida\n• Palabras de amor para la familia\n• Un consejo que solía dar\n• Lo que tú quieras escuchar\n\nEscribe el mensaje completo (máximo 20 segundos de lectura):`
    );
  } else if (opcion === 'b') {
    await orderService.update(orden.id, {
      tiene_audio_referencia: false,
      usa_voz_profesional: false,
      sin_voz: true
    });
    
    await clientService.update(cliente.id, {
      etapa_actual: 'pregunta_12_musica'
    });
    
    await sendTextMessage(
      whatsapp,
      'Perfecto! 🎵\n\n1️⃣2️⃣ ¿Qué estilo de música prefieres?\n\n1. Música clásica celestial (Ave María, etc.)\n2. Música instrumental suave (piano, violín)\n3. Música religiosa (católica/cristiana)\nOtra, (dime cual)\n\nResponde con el número o descríbeme el estilo.'
    );
  } else {
    await sendTextMessage(
      whatsapp,
      'Por favor responde A o B para continuar.'
    );
  }
}

// ============================================================
// PREGUNTA 12: MÚSICA
// ============================================================

async function handlePregunta12Musica(
  whatsapp: string,
  cliente: Cliente,
  messageText: string
): Promise<void> {
  const orden = await orderService.getOrdenActivaByCliente(cliente.id);
  if (!orden) throw new Error('No se encontró orden activa');
  
  const respuesta = messageText.trim();
  
  let estiloMusica: string;
  let estiloMusicaOtro: string | null = null;
  
  if (respuesta === '1') {
    estiloMusica = 'clasica_celestial';
  } else if (respuesta === '2') {
    estiloMusica = 'instrumental_suave';
  } else if (respuesta === '3') {
    estiloMusica = 'religiosa';
  } else {
    estiloMusica = 'otro';
    estiloMusicaOtro = respuesta;
  }
  
  await orderService.update(orden.id, {
    estilo_musica: estiloMusica,
    estilo_musica_otro: estiloMusicaOtro
  });
  
  await clientService.update(cliente.id, {
    etapa_actual: 'pregunta_13_texto_especial'
  });
  
  await sendTextMessage(
    whatsapp,
    '1️⃣3️⃣ ¿Quieres que incluyamos algún texto especial en el video?\n\nPor ejemplo:\n• Una oración (Padre Nuestro, Ave María, etc.)\n• Un poema\n• Una frase que ella decía\n• Fechas importantes (nacimiento - fallecimiento)\n\nEscribe el texto que quieres incluir, o responde "NO" si prefieres solo las fotos y el mensaje hablado.'
  );
}

// ============================================================
// PREGUNTA 13: TEXTO ESPECIAL
// ============================================================

async function handlePregunta13TextoEspecial(
  whatsapp: string,
  cliente: Cliente,
  messageText: string
): Promise<void> {
  const orden = await orderService.getOrdenActivaByCliente(cliente.id);
  if (!orden) throw new Error('No se encontró orden activa');
  
  const textoEspecial = isNegative(messageText) ? null : messageText.trim();
  
  await orderService.update(orden.id, {
    texto_especial: textoEspecial
  });
  
  await clientService.update(cliente.id, {
    etapa_actual: 'pregunta_14_estilo_visual'
  });
  
  await sendTextMessage(
    whatsapp,
    '1️⃣4️⃣ ¿Qué estilo visual prefieres?\n\n1. Clásico elegante (transiciones suaves, colores cálidos)\n2. Moderno minimalista (limpio, simple)\n3. Religioso/espiritual (cruces, ángeles, luz)\n4. Natural/jardín (flores, naturaleza)\n\nResponde con el número.'
  );
}

// ============================================================
// PREGUNTA 14: ESTILO VISUAL
// ============================================================

async function handlePregunta14EstiloVisual(
  whatsapp: string,
  cliente: Cliente,
  messageText: string
): Promise<void> {
  const orden = await orderService.getOrdenActivaByCliente(cliente.id);
  if (!orden) throw new Error('No se encontró orden activa');
  
  const respuesta = messageText.trim();
  
  let estiloVisual: string;
  
  switch (respuesta) {
    case '1':
      estiloVisual = 'clasico_elegante';
      break;
    case '2':
      estiloVisual = 'moderno_minimalista';
      break;
    case '3':
      estiloVisual = 'religioso_espiritual';
      break;
    case '4':
      estiloVisual = 'natural_jardin';
      break;
    default:
      await sendTextMessage(
        whatsapp,
        'Por favor responde con un número del 1 al 4.'
      );
      return;
  }
  
  await orderService.update(orden.id, {
    estilo_visual: estiloVisual
  });
  
  await clientService.update(cliente.id, {
    etapa_actual: 'confirmacion_resumen'
  });
  
  await enviarResumenOrden(whatsapp, cliente, orden);
}

// ============================================================
// CONFIRMACIÓN Y RESUMEN
// ============================================================

async function enviarResumenOrden(
  whatsapp: string,
  cliente: Cliente,
  orden: Orden
): Promise<void> {
  const ordenActualizada = await orderService.getOrdenActivaByCliente(cliente.id);
  if (!ordenActualizada) throw new Error('No se encontró orden');
  
  const serviciosAdicionales = [];
  if (ordenActualizada.servicio_qr) serviciosAdicionales.push('Código QR para lápida');
  if (ordenActualizada.servicio_ingles) serviciosAdicionales.push('Versión en inglés');
  if (ordenActualizada.servicio_express) serviciosAdicionales.push('Entrega express (6 horas)');
  
  const serviciosTexto = serviciosAdicionales.length > 0 
    ? serviciosAdicionales.join(', ')
    : 'Ninguno';
  
  const fechaNacTexto = ordenActualizada.fecha_nacimiento 
    ? formatDate(new Date(ordenActualizada.fecha_nacimiento))
    : 'No especificada';
  
  const mensajeHabladoTexto = ordenActualizada.sin_voz 
    ? 'NO (solo música y texto)'
    : ordenActualizada.tiene_audio_referencia 
      ? 'SÍ (con voz clonada)'
      : 'SÍ (con voz profesional)';
  
  const musicaTexto = ordenActualizada.estilo_musica === 'otro'
    ? ordenActualizada.estilo_musica_otro
    : ordenActualizada.estilo_musica?.replace('_', ' ');
  
  const textoEspecialTexto = ordenActualizada.texto_especial 
    ? 'Sí (incluido)'
    : 'No';
  
  const estiloVisualTexto = ordenActualizada.estilo_visual?.replace('_', ' ');
  
  const resumen = `Déjame confirmar todo:

RESUMEN DE TU ORDEN:

Cliente: ${cliente.nombre_completo}
Ciudad: ${cliente.ciudad}
WhatsApp: ${cliente.whatsapp}

Memorial para: ${ordenActualizada.nombre_difunto} (${ordenActualizada.relacion_difunto})
${fechaNacTexto} - ${formatDate(new Date(ordenActualizada.fecha_fallecimiento))}

Paquete: ÚNICO
Fotos: ${ordenActualizada.numero_fotos} fotos
Mensaje hablado: ${mensajeHabladoTexto}
Música: ${musicaTexto}
Texto: ${textoEspecialTexto}
Estilo: ${estiloVisualTexto}
Servicios adicionales: ${serviciosTexto}
Entrega: ${ordenActualizada.servicio_express ? '6 horas' : '24 horas'}

TOTAL: ${formatPrice(ordenActualizada.precio_final)}

¿Todo está correcto? (SÍ/NO)`;
  
  await sendTextMessage(whatsapp, resumen);
}

async function handleConfirmacionResumen(
  whatsapp: string,
  cliente: Cliente,
  messageText: string
): Promise<void> {
  if (isAffirmative(messageText)) {
    await clientService.update(cliente.id, {
      etapa_actual: 'pregunta_15_metodo_pago'
    });
    
    await sendTextMessage(
      whatsapp,
      'Todo confirmado. 🙏\n\n1️⃣5️⃣ ¿Cómo prefieres pagar?\n\n1. Transferencia bancaria\n2. Depósito en OXXO\n3. Tarjeta de crédito/débito (link de pago)\n\nResponde con el número.'
    );
  } else if (isNegative(messageText)) {
    await sendTextMessage(
      whatsapp,
      '¿Qué quieres corregir? Dime qué dato necesitas cambiar y lo ajustamos.'
    );
    
    await clientService.update(cliente.id, {
      requiere_atencion_personal: true,
      bot_pausado: true
    });
  } else {
    await sendTextMessage(
      whatsapp,
      'Por favor responde SÍ si todo está correcto, o NO si quieres corregir algo.'
    );
  }
}

// ============================================================
// PREGUNTA 15: MÉTODO DE PAGO
// ============================================================

async function handlePregunta15MetodoPago(
  whatsapp: string,
  cliente: Cliente,
  messageText: string
): Promise<void> {
  const respuesta = messageText.trim();
  
  const orden = await orderService.getOrdenActivaByCliente(cliente.id);
  if (!orden) throw new Error('No se encontró orden activa');
  
  if (respuesta === '1') {
    await clientService.update(cliente.id, {
      etapa_actual: 'esperando_comprobante'
    });
    
    await sendTextMessage(
      whatsapp,
      `Perfecto! 💳\n\nAquí están los datos para transferencia:\n\nBANCO: BBVA\nNOMBRE: [Tu Nombre]\nCUENTA: 1234567890\nMONTO: ${formatPrice(orden.precio_final)}\nREFERENCIA: ${orden.numero_orden}\n\nUna vez que hagas la transferencia, por favor envíame foto del comprobante de pago.\n\nCuando lo reciba, comenzaremos inmediatamente con tu memorial 🕊️`
    );
  } else if (respuesta === '2') {
    await clientService.update(cliente.id, {
      etapa_actual: 'esperando_comprobante'
    });
    
    await sendTextMessage(
      whatsapp,
      `Perfecto!\n\nPuedes pagar en cualquier OXXO con esta referencia:\n\nMONTO: ${formatPrice(orden.precio_final)}\nREFERENCIA: ${orden.numero_orden}\n\nUna vez que pagues, envíame foto del ticket.\n\nCuando lo reciba, comenzaremos inmediatamente con tu memorial 🕊️`
    );
  } else if (respuesta === '3') {
    try {
      const servicios = {
        qr: orden.servicio_qr,
        ingles: orden.servicio_ingles,
        express: orden.servicio_express
      };
      
      const { url } = await paymentService.createCheckoutSession(
        orden.id,
        orden.numero_orden,
        orden.precio_final,
        servicios
      );
      
      await clientService.update(cliente.id, {
        etapa_actual: 'esperando_pago_stripe'
      });
      
      await sendTextMessage(
        whatsapp,
        `Perfecto!\n\nAquí está tu link de pago seguro:\n\n${url}\n\nMONTO: ${formatPrice(orden.precio_final)}\n\nUna vez que completes el pago, recibirás confirmación automática y comenzaremos inmediatamente con tu memorial 🕊️`
      );
    } catch (error) {
      logger.error({ error, ordenId: orden.id }, 'Error creando sesión de Stripe');
      
      await clientService.update(cliente.id, {
        requiere_atencion_personal: true,
        bot_pausado: true
      });
      
      await sendTextMessage(
        whatsapp,
        'Hubo un problema generando el link de pago. Un asesor te contactará en breve para ayudarte 🕊️'
      );
    }
  } else {
    await sendTextMessage(
      whatsapp,
      'Por favor responde con el número 1, 2 o 3 según tu método de pago preferido.'
    );
  }
}

// ============================================================
// ESPERANDO COMPROBANTE
// ============================================================

async function handleEsperandoComprobante(
  whatsapp: string,
  cliente: Cliente,
  message: proto.IWebMessageInfo
): Promise<void> {
  const imageMessage = message.message?.imageMessage;
  
  if (!imageMessage) {
    await sendTextMessage(
      whatsapp,
      'Por favor envía la foto del comprobante de pago.'
    );
    return;
  }
  
  const buffer = await downloadMedia(message);
  if (!buffer) {
    await sendTextMessage(whatsapp, 'No pude descargar la imagen. Por favor envíala de nuevo.');
    return;
  }
  
  const orden = await orderService.getOrdenActivaByCliente(cliente.id);
  if (!orden) throw new Error('No se encontró orden activa');
  
  const filename = `comprobante_${orden.numero_orden}_${Date.now()}.jpg`;
  const archivo = await fileService.saveFile(orden.id, buffer, filename, 'foto', 'comprobante');
  
  await paymentService.registrarPagoManual(
    orden.id,
    orden.numero_orden,
    'transferencia',
    archivo.url_archivo
  );
  
  await orderService.marcarComoPagada(orden.id);
  
  await clientService.update(cliente.id, {
    etapa_actual: 'orden_confirmada'
  });
  
  const ordenActualizada = await orderService.getOrdenActivaByCliente(cliente.id);
  
  await sendTextMessage(
    whatsapp,
    `¡Pago recibido! ✅\n\nTu orden ${orden.numero_orden} está confirmada.\n\nFecha de entrega: ${formatDate(new Date(ordenActualizada!.fecha_entrega_estimada!))}\nTe enviaré el video al número WhatsApp registrado.\n\nComenzaremos a trabajar en el memorial de ${orden.nombre_difunto} con todo el amor y cuidado que merece.\n\nGracias celestiales.`
  );
}

// ============================================================
// ESPERANDO PAGO STRIPE
// ============================================================

async function handleEsperandoPagoStripe(
  whatsapp: string,
  cliente: Cliente,
  messageText: string
): Promise<void> {
  await sendTextMessage(
    whatsapp,
    'Estamos esperando la confirmación de tu pago.\n\nSi ya pagaste, recibirás confirmación en unos momentos.\n\nSi tienes algún problema, escribe AYUDA y te atendemos personalmente.'
  );
}

// ============================================================
// REVISIÓN DE VIDEO
// ============================================================

async function handleRevisionVideo(
  whatsapp: string,
  cliente: Cliente,
  messageText: string
): Promise<void> {
  const respuesta = messageText.trim();
  
  const orden = await orderService.getOrdenActivaByCliente(cliente.id);
  if (!orden) throw new Error('No se encontró orden activa');
  
  if (respuesta === '1') {
    await orderService.update(orden.id, {
      aprobado: true,
      estado: 'entregado',
      fecha_entrega_real: new Date()
    });
    
    await clientService.update(cliente.id, {
      etapa_actual: 'pregunta_testimonio'
    });
    
    await sendTextMessage(
      whatsapp,
      `Me alegra mucho que te haya gustado.\n\n¿Nos ayudarías con un testimonio?\n\nNos ayuda mucho que otras familias conozcan nuestro servicio. Puedes:\n\n1. Escribir unas palabras sobre tu experiencia\n2. Darnos una calificación de 1-5 estrellas aquí: ${config.googleBusinessReviewUrl}\n3. Ningún testimonio\n\n¿Te gustaría compartir tu experiencia?\n(Es opcional, pero muy valioso para nosotros, responde 3 si no quieres dar ningún tipo de testimonio)`
    );
  } else if (respuesta === '2') {
    if (orden.revision_incluida_usada) {
      await sendTextMessage(
        whatsapp,
        'Ya utilizaste tu revisión incluida en el paquete.\n\nPuedes solicitar cambios adicionales por $300 MXN.\n\n¿Deseas continuar? (SÍ/NO)'
      );
      
      await clientService.update(cliente.id, {
        etapa_actual: 'confirmar_revision_adicional'
      });
    } else {
      await clientService.update(cliente.id, {
        etapa_actual: 'esperando_cambios'
      });
      
      await sendTextMessage(
        whatsapp,
        'Dime que quieres cambiar, todo en un solo mensaje'
      );
    }
  } else {
    await sendTextMessage(
      whatsapp,
      'Por favor responde 1 si todo está perfecto, o 2 si quieres algún cambio.'
    );
  }
}

// ============================================================
// ESPERANDO CAMBIOS
// ============================================================

async function handleEsperandoCambios(
  whatsapp: string,
  cliente: Cliente,
  messageText: string
): Promise<void> {
  const orden = await orderService.getOrdenActivaByCliente(cliente.id);
  if (!orden) throw new Error('No se encontró orden activa');
  
  await orderService.update(orden.id, {
    revision_solicitada: true,
    cambios_solicitados: messageText,
    revision_incluida_usada: true,
    estado: 'en_revision'
  });
  
  await clientService.update(cliente.id, {
    etapa_actual: 'esperando_video_corregido'
  });
  
  await sendTextMessage(
    whatsapp,
    'Perfecto! Haremos los cambios que solicitaste.\n\nTe enviaremos el video corregido en las próximas horas.\n\nGracias por tu paciencia 🕊️'
  );
}

// ============================================================
// CONFIRMAR REVISIÓN ADICIONAL (humano + pago)
// ============================================================

async function handleConfirmarRevisionAdicional(
  whatsapp: string,
  cliente: Cliente,
  messageText: string
): Promise<void> {
  const orden = await orderService.getOrdenActivaByCliente(cliente.id);
  if (!orden) throw new Error('No se encontró orden activa');

  if (isAffirmative(messageText)) {
    await clientService.update(cliente.id, { requiere_atencion_personal: true, bot_pausado: true });
    await sendTextMessage(
      whatsapp,
      'Un asesor te contactará para coordinar el pago de la revisión adicional y los ajustes.'
    );
  } else if (isNegative(messageText)) {
    await clientService.update(cliente.id, { etapa_actual: 'pregunta_testimonio' });
    await sendTextMessage(
      whatsapp,
      `Me alegra que te haya gustado.\n\n¿Nos ayudarías con un testimonio?\n\n1. Escribir unas palabras\n2. Calificación en Google\n3. Ningún testimonio`
    );
  } else {
    await sendTextMessage(whatsapp, 'Responde SÍ si quieres la revisión adicional, o NO para continuar.');
  }
}

// ============================================================
// PREGUNTA TESTIMONIO
// ============================================================

async function handlePreguntaTestimonio(
  whatsapp: string,
  cliente: Cliente,
  messageText: string
): Promise<void> {
  const respuesta = messageText.trim();
  
  const orden = await orderService.getOrdenActivaByCliente(cliente.id);
  if (!orden) throw new Error('No se encontró orden activa');
  
  if (respuesta === '1') {
    await clientService.update(cliente.id, {
      etapa_actual: 'esperando_testimonio_texto'
    });
    
    await sendTextMessage(
      whatsapp,
      'Gracias! Por favor escribe tu testimonio:'
    );
  } else if (respuesta === '2') {
    await testimonioService.create(cliente.id, orden.id, {
      testimonioGoogle: true
    });
    
    await clientService.update(cliente.id, {
      etapa_actual: 'flujo_completado'
    });
    
    await sendTextMessage(
      whatsapp,
      `¡Gracias! Te envío el link para dejar tu reseña:\n\n${config.googleBusinessReviewUrl}\n\nTu opinión nos ayuda mucho 🙏\n\n¡Muchísimas gracias! Esperamos que Memoriales Celestiales brinde un grato recuerdo y mucha luz para ti y tu familia.\n\nAdiós! 🕊️`
    );
  } else if (respuesta === '3') {
    await testimonioService.create(cliente.id, orden.id, {
      sinTestimonio: true
    });
    
    await clientService.update(cliente.id, {
      etapa_actual: 'flujo_completado'
    });
    
    await sendTextMessage(
      whatsapp,
      `Sin problema, lo entendemos perfectamente.\n\nGracias por confiar en nosotros para honrar la memoria de ${orden.nombre_difunto} 🕊️\n\n¡Muchísimas gracias! Esperamos que Memoriales Celestiales brinde un grato recuerdo y mucha luz para ti y tu familia.\n\nAdiós! 🕊️`
    );
  } else {
    await sendTextMessage(
      whatsapp,
      'Por favor responde 1, 2 o 3 según tu preferencia.'
    );
  }
}

// ============================================================
// ESPERANDO TESTIMONIO TEXTO
// ============================================================

async function handleEsperandoTestimonioTexto(
  whatsapp: string,
  cliente: Cliente,
  messageText: string
): Promise<void> {
  const orden = await orderService.getOrdenActivaByCliente(cliente.id);
  if (!orden) throw new Error('No se encontró orden activa');
  
  await testimonioService.create(cliente.id, orden.id, {
    testimonioTexto: messageText.trim()
  });
  
  await clientService.update(cliente.id, {
    etapa_actual: 'confirmar_publicacion_testimonio'
  });
  
  await sendTextMessage(
    whatsapp,
    '¡Gracias por tu testimonio! 🙏\n\n¿Autorizas que publiquemos tu testimonio en nuestras redes sociales? (SÍ/NO)'
  );
}

// ============================================================
// CONFIRMAR PUBLICACIÓN
// ============================================================

async function handleConfirmarPublicacionTestimonio(
  whatsapp: string,
  cliente: Cliente,
  messageText: string
): Promise<void> {
  const orden = await orderService.getOrdenActivaByCliente(cliente.id);
  if (!orden) throw new Error('No se encontró orden activa');
  
  const autoriza = isAffirmative(messageText);
  
  await db.query(
    'UPDATE testimonios SET autoriza_publicacion = $1 WHERE orden_id = $2',
    [autoriza, orden.id]
  );
  
  await clientService.update(cliente.id, {
    etapa_actual: 'flujo_completado'
  });
  
  await sendTextMessage(
    whatsapp,
    '¡Muchísimas gracias! Esperamos que Memoriales Celestiales brinde un grato recuerdo y mucha luz para ti y tu familia.\n\nAdiós! 🕊️'
  );
}