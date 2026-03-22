-- ============================================================
-- MEMORIALES CELESTIALES - BASE DE DATOS POSTGRESQL
-- Script de Creación Completo
-- Versión: 1.0
-- Fecha: 22 de marzo de 2026
-- ============================================================

-- ============================================================
-- IMPORTANTE PARA EL BOT (al borrar una orden o timeout de borrador)
-- ============================================================
-- Qué tiene que hacer tu programa (en este orden):
--   1) Borrar pagos de esa orden (si hay).
--   2) Borrar testimonios de esa orden (si hay).
--   3) Borrar la orden.
--
-- Eso es todo el misterio: no es un bug, es una regla de seguridad en la
-- base para que no queden pagos o testimonios apuntando a una orden
-- fantasma. Este script SQL declara esa regla (FK con ON DELETE RESTRICT);
-- el bot / backend debe implementar los tres pasos de arriba cuando elimine
-- una orden. No hace falta “ejecutar” este párrafo: es documentación.
-- ============================================================

-- ============================================================
-- PASO 1: CREAR BASE DE DATOS (LO HACES TÚ A MANO; NO VA EN ESTE ARCHIVO)
-- ============================================================
--
-- 1) Crea la base en el servidor (usuario con permisos, p. ej. postgres).
--    Ajusta LC_COLLATE / LC_CTYPE si en tu OS no existe es_MX (ver `locale -a`).
--
--    CREATE DATABASE memoriales_celestiales
--      WITH ENCODING 'UTF8'
--      LC_COLLATE = 'es_MX.UTF-8'
--      LC_CTYPE = 'es_MX.UTF-8'
--      TEMPLATE = template0;
--
-- 2) Opcional, ya conectado a esa base:
--    COMMENT ON DATABASE memoriales_celestiales IS 'Memoriales Celestiales - videos memoriales con IA';
--
-- 3) Ejecuta EL RESTO de este script conectado a memoriales_celestiales, por ejemplo:
--    psql -U postgres -d memoriales_celestiales -f script_database.sql
--
-- ============================================================
-- BORRADO DE ÓRDENES (mismo tema que “IMPORTANTE PARA EL BOT” arriba)
-- ============================================================
-- pagos.orden_id y testimonios.orden_id usan ON DELETE RESTRICT: PostgreSQL
-- NO deja borrar una fila en ordenes si aún hay filas en pagos o testimonios
-- que apunten a esa orden.
--
-- En SQL sería el mismo orden que en el bot:
--   1) DELETE FROM pagos WHERE orden_id = ...;
--   2) DELETE FROM testimonios WHERE orden_id = ...;  -- raro en borrador
--   3) DELETE FROM ordenes WHERE id = ...;   -- archivos se borran solos (CASCADE)
--
-- Si prefieres que al borrar orden desaparezcan pagos automáticamente, habría
-- que cambiar la FK a ON DELETE CASCADE (solo si te conviene a nivel negocio).
-- ============================================================

-- ============================================================
-- PASO 2: CREAR EXTENSIONES
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ============================================================
-- PASO 3: CREAR TIPOS ENUM
-- ============================================================

-- Estado de leads
CREATE TYPE estado_lead AS ENUM (
    'nuevo',
    'contactado',
    'en_proceso',
    'convertido',
    'perdido',
    'requiere_atencion'
);

-- Estado de órdenes
-- borrador = captura paso a paso sin pago; eliminar orden tras 24 h inactividad si aún no paga (ver PLANTILLAS WhatsApp)
CREATE TYPE estado_orden AS ENUM (
    'borrador',
    'pendiente',
    'pago_pendiente',
    'pago_recibido',
    'en_produccion',
    'en_revision',
    'aprobado',
    'entregado',
    'cancelado'
);

-- Estado de pago
CREATE TYPE estado_pago AS ENUM (
    'pendiente',
    'completado',
    'reembolsado',
    'cancelado'
);

-- Método de pago
CREATE TYPE metodo_pago AS ENUM (
    'transferencia',
    'oxxo',
    'tarjeta'
);

-- Estilo de música
CREATE TYPE estilo_musica AS ENUM (
    'clasica_celestial',
    'instrumental_suave',
    'religiosa',
    'otro'
);

-- Estilo visual
CREATE TYPE estilo_visual AS ENUM (
    'clasico_elegante',
    'moderno_minimalista',
    'religioso_espiritual',
    'natural_jardin'
);

-- ============================================================
-- PASO 4: TABLA DE CLIENTES
-- ============================================================

CREATE TABLE clientes (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,

    -- Información personal
    nombre_completo VARCHAR(255) NOT NULL,
    whatsapp VARCHAR(10) NOT NULL, -- Sin guiones, solo 10 dígitos
    ciudad VARCHAR(100),

    -- Control de flujo
    requiere_atencion_personal BOOLEAN DEFAULT false,
    etapa_actual VARCHAR(80),
    bot_pausado BOOLEAN DEFAULT false,
    intentos_validacion_telefono INTEGER DEFAULT 0,
    ultima_actividad_cliente_at TIMESTAMP,
    cerrada_por_inactividad_at TIMESTAMP,

    -- Auditoría
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

-- Índices
CREATE INDEX idx_clientes_whatsapp ON clientes(whatsapp);
CREATE INDEX idx_clientes_nombre ON clientes USING gin(nombre_completo gin_trgm_ops);
CREATE INDEX idx_clientes_ciudad ON clientes(ciudad);
CREATE INDEX idx_clientes_created_at ON clientes(created_at DESC);

COMMENT ON TABLE clientes IS 'Clientes que contratan servicios de memoriales';
COMMENT ON COLUMN clientes.whatsapp IS 'Teléfono de 10 dígitos sin guiones';
COMMENT ON COLUMN clientes.requiere_atencion_personal IS 'TRUE si el cliente dijo NO en el primer contacto';
COMMENT ON COLUMN clientes.etapa_actual IS 'Paso del bot WhatsApp; reiniciar al crear nueva sesión tras timeout 24 h';
COMMENT ON COLUMN clientes.ultima_actividad_cliente_at IS 'Último mensaje del cliente; para timeout de inactividad';

-- ============================================================
-- PASO 5: TABLA DE ÓRDENES
-- ============================================================

CREATE TABLE ordenes (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    numero_orden VARCHAR(20) UNIQUE NOT NULL, -- MC-2026-0001

    -- Relación con cliente
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,

    -- Información del difunto
    nombre_difunto VARCHAR(255) NOT NULL,
    relacion_difunto VARCHAR(100) NOT NULL, -- madre, padre, hijo, etc.
    fecha_fallecimiento DATE NOT NULL,
    fecha_nacimiento DATE, -- NULL si cliente respondió "NO SE"

    -- Paquete (siempre único)
    paquete VARCHAR(50) DEFAULT 'unico' NOT NULL,

    -- Servicios adicionales
    servicio_qr BOOLEAN DEFAULT false,
    servicio_ingles BOOLEAN DEFAULT false,
    servicio_express BOOLEAN DEFAULT false,

    -- Precios
    precio_base DECIMAL(10,2) DEFAULT 800.00 NOT NULL,
    precio_servicios_adicionales DECIMAL(10,2) DEFAULT 0.00,
    precio_final DECIMAL(10,2) NOT NULL,

    -- Fotos
    numero_fotos INTEGER DEFAULT 0,

    -- Mensaje hablado
    tiene_audio_referencia BOOLEAN DEFAULT false,
    audio_referencia_url TEXT,
    mensaje_voz_texto TEXT,
    usa_voz_profesional BOOLEAN DEFAULT false,
    sin_voz BOOLEAN DEFAULT false,

    -- Música
    estilo_musica estilo_musica,
    estilo_musica_otro TEXT, -- Si eligió "otro"

    -- Texto especial
    texto_especial TEXT, -- NULL si dijo "NO"

    -- Estilo visual
    estilo_visual estilo_visual,

    -- Estado y fechas
    estado estado_orden DEFAULT 'borrador',
    fecha_orden TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_entrega_estimada TIMESTAMP,
    fecha_entrega_real TIMESTAMP,

    -- Entrega
    url_video_final TEXT,
    url_video_whatsapp TEXT, -- Versión comprimida para WhatsApp

    -- Revisión
    aprobado BOOLEAN DEFAULT false,
    revision_solicitada BOOLEAN DEFAULT false,
    cambios_solicitados TEXT,
    revision_incluida_usada BOOLEAN DEFAULT false, -- TRUE tras entregar video corregido (1 revisión gratis; ver PLANTILLAS ETAPA 11)

    -- Producción
    editor_asignado INTEGER, -- ID del usuario editor
    tiempo_produccion INTEGER, -- Minutos

    -- Notas internas
    notas_internas TEXT,

    -- Auditoría
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

-- Índices
CREATE INDEX idx_ordenes_cliente ON ordenes(cliente_id);
CREATE INDEX idx_ordenes_numero ON ordenes(numero_orden);
CREATE INDEX idx_ordenes_estado ON ordenes(estado);
CREATE INDEX idx_ordenes_fecha_orden ON ordenes(fecha_orden DESC);
CREATE INDEX idx_ordenes_fecha_entrega ON ordenes(fecha_entrega_estimada);
CREATE INDEX idx_ordenes_editor ON ordenes(editor_asignado);

COMMENT ON TABLE ordenes IS 'Órdenes de memoriales con toda la información del servicio';
COMMENT ON COLUMN ordenes.numero_orden IS 'Formato: MC-YYYY-NNNN (MC-2026-0001)';
COMMENT ON COLUMN ordenes.fecha_nacimiento IS 'NULL si cliente respondió NO SE';
COMMENT ON COLUMN ordenes.sin_voz IS 'TRUE si cliente eligió opción B (sin voz)';
COMMENT ON COLUMN ordenes.revision_incluida_usada IS 'TRUE cuando ya se aplicó la revisión gratuita del paquete (ETAPA 11 WhatsApp)';

-- ============================================================
-- PASO 6: TABLA DE PAGOS
-- ============================================================

CREATE TABLE pagos (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,

    -- Relación con orden
    orden_id INTEGER NOT NULL REFERENCES ordenes(id) ON DELETE RESTRICT,

    -- Información del pago
    monto DECIMAL(10,2) NOT NULL,
    metodo metodo_pago NOT NULL,
    estado estado_pago DEFAULT 'pendiente',

    -- Detalles de transacción
    referencia_pago VARCHAR(255), -- Número de orden o referencia
    comprobante_url TEXT, -- URL del comprobante de pago

    -- Fechas
    fecha_pago TIMESTAMP,

    -- Información adicional según método
    banco VARCHAR(100), -- Legado / manual
    codigo_barras TEXT, -- Legado OXXO
    link_pago TEXT, -- URL Checkout Stripe u otro

    -- Stripe (webhook / reconciliación; ver PLANTILLAS pago)
    stripe_checkout_session_id VARCHAR(255),
    stripe_payment_intent_id VARCHAR(255),

    -- Auditoría
    procesado_por INTEGER, -- ID del usuario que procesó
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX idx_pagos_orden ON pagos(orden_id);
CREATE INDEX idx_pagos_estado ON pagos(estado);
CREATE INDEX idx_pagos_metodo ON pagos(metodo);
CREATE INDEX idx_pagos_fecha ON pagos(fecha_pago DESC);
CREATE INDEX idx_pagos_referencia ON pagos(referencia_pago);

COMMENT ON TABLE pagos IS 'Registro de pagos; Stripe vía webhook llena stripe_* y estado';
COMMENT ON COLUMN pagos.referencia_pago IS 'Número de orden MC-YYYY-NNNN';
COMMENT ON COLUMN pagos.stripe_checkout_session_id IS 'cs_... de Stripe Checkout Session';
COMMENT ON COLUMN pagos.stripe_payment_intent_id IS 'pi_... al confirmar pago';

-- ============================================================
-- PASO 7: TABLA DE ARCHIVOS
-- ============================================================

CREATE TABLE archivos (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,

    -- Relación
    orden_id INTEGER NOT NULL REFERENCES ordenes(id) ON DELETE CASCADE,

    -- Información del archivo
    nombre_original VARCHAR(255) NOT NULL,
    nombre_almacenado VARCHAR(255) NOT NULL,
    tipo_archivo VARCHAR(50) NOT NULL, -- foto, audio, video
    mime_type VARCHAR(100),
    extension VARCHAR(10),

    -- Almacenamiento: binario en disco del servidor; aquí solo ruta o URL propia (ver PLANTILLAS ETAPA 5)
    url_archivo TEXT NOT NULL,
    almacenamiento_origen VARCHAR(30) DEFAULT 'servidor_local', -- servidor_local | url_publica | (futuro: s3, etc.)
    tamano_bytes BIGINT,

    -- Metadata de imagen/video
    ancho INTEGER,
    alto INTEGER,
    duracion INTEGER, -- Para videos/audios en segundos

    -- Categorización
    categoria VARCHAR(50), -- original, restaurada, audio_referencia
    orden_visualizacion INTEGER, -- Para ordenar fotos en el video

    -- Auditoría
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

-- Índices
CREATE INDEX idx_archivos_orden ON archivos(orden_id);
CREATE INDEX idx_archivos_tipo ON archivos(tipo_archivo);
CREATE INDEX idx_archivos_categoria ON archivos(categoria);
CREATE INDEX idx_archivos_created_at ON archivos(created_at DESC);

COMMENT ON TABLE archivos IS 'Metadatos y referencia a archivos en disco del servidor (o URL propia); bytes no en BYTEA';
COMMENT ON COLUMN archivos.url_archivo IS 'Ruta absoluta en el servidor o URL HTTPS servida por la misma API; ver MEDIA_STORAGE_PATH en .env';
COMMENT ON COLUMN archivos.nombre_almacenado IS 'Nombre único del fichero en el directorio de medios';
COMMENT ON COLUMN archivos.almacenamiento_origen IS 'servidor_local por defecto; ampliar si más adelante usas S3/R2';
COMMENT ON COLUMN archivos.orden_visualizacion IS 'Orden en que aparecen las fotos en el video';

-- ============================================================
-- PASO 8: TABLA DE TESTIMONIOS
-- ============================================================

CREATE TABLE testimonios (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,

    -- Relaciones
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
    orden_id INTEGER NOT NULL REFERENCES ordenes(id) ON DELETE RESTRICT,

    -- Contenido del testimonio
    testimonio_texto TEXT,
    testimonio_google BOOLEAN DEFAULT false,
    sin_testimonio BOOLEAN DEFAULT false,

    -- Permisos
    autoriza_publicacion BOOLEAN DEFAULT false,

    -- Publicación
    publicado BOOLEAN DEFAULT false,
    fecha_publicacion TIMESTAMP,

    -- Auditoría
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX idx_testimonios_cliente ON testimonios(cliente_id);
CREATE INDEX idx_testimonios_orden ON testimonios(orden_id);
CREATE INDEX idx_testimonios_publicado ON testimonios(publicado);
CREATE INDEX idx_testimonios_created_at ON testimonios(created_at DESC);

COMMENT ON TABLE testimonios IS 'Testimonios de clientes satisfechos';
COMMENT ON COLUMN testimonios.testimonio_google IS 'TRUE si dejó reseña en Google Business';

-- ============================================================
-- PASO 9: TABLA DE USUARIOS (EQUIPO)
-- ============================================================

CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,

    -- Información personal
    nombre_completo VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    telefono VARCHAR(20),

    -- Autenticación
    password_hash VARCHAR(255) NOT NULL,
    ultimo_login TIMESTAMP,
    activo BOOLEAN DEFAULT true,

    -- Rol
    rol VARCHAR(50) NOT NULL, -- admin, editor, vendedor

    -- Estadísticas (para editores)
    ordenes_completadas INTEGER DEFAULT 0,
    tiempo_promedio_produccion INTEGER, -- Minutos

    -- Auditoría
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

-- Índices
CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_usuarios_rol ON usuarios(rol);
CREATE INDEX idx_usuarios_activo ON usuarios(activo);

COMMENT ON TABLE usuarios IS 'Equipo interno: admin, editores, vendedores';

-- ============================================================
-- PASO 10: TABLA DE LEADS (OPCIONAL - PARA TRACKING)
-- ============================================================

CREATE TABLE leads (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,

    -- Información básica
    nombre VARCHAR(255),
    whatsapp VARCHAR(20),

    -- Estado
    estado estado_lead DEFAULT 'nuevo',

    -- Conversión
    convertido_cliente_id INTEGER REFERENCES clientes(id),
    fecha_conversion TIMESTAMP,

    -- Auditoría
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX idx_leads_estado ON leads(estado);
CREATE INDEX idx_leads_whatsapp ON leads(whatsapp);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);

COMMENT ON TABLE leads IS 'Tracking de leads antes de convertirse en clientes';

-- ============================================================
-- PASO 11: FUNCIONES Y TRIGGERS
-- ============================================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger a todas las tablas
CREATE TRIGGER update_clientes_updated_at 
    BEFORE UPDATE ON clientes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ordenes_updated_at 
    BEFORE UPDATE ON ordenes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pagos_updated_at 
    BEFORE UPDATE ON pagos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_archivos_updated_at 
    BEFORE UPDATE ON archivos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_testimonios_updated_at 
    BEFORE UPDATE ON testimonios
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_usuarios_updated_at 
    BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated_at 
    BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Función para generar número de orden automático
CREATE OR REPLACE FUNCTION generar_numero_orden()
RETURNS TRIGGER AS $$
DECLARE
    anio VARCHAR(4);
    contador INTEGER;
    nuevo_numero VARCHAR(20);
BEGIN
    -- Si ya tiene número de orden, no hacer nada
    IF NEW.numero_orden IS NOT NULL AND NEW.numero_orden != '' THEN
        RETURN NEW;
    END IF;

    anio := TO_CHAR(CURRENT_DATE, 'YYYY');

    -- Contar órdenes del año actual
    SELECT COUNT(*) + 1 INTO contador
    FROM ordenes
    WHERE numero_orden LIKE 'MC-' || anio || '-%';

    -- Generar número con formato MC-YYYY-NNNN
    nuevo_numero := 'MC-' || anio || '-' || LPAD(contador::TEXT, 4, '0');
    NEW.numero_orden := nuevo_numero;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para generar número de orden
CREATE TRIGGER generar_numero_orden_trigger
    BEFORE INSERT ON ordenes
    FOR EACH ROW
    EXECUTE FUNCTION generar_numero_orden();

-- Función para calcular precio final automáticamente
CREATE OR REPLACE FUNCTION calcular_precio_final()
RETURNS TRIGGER AS $$
BEGIN
    NEW.precio_servicios_adicionales := 0;

    -- Sumar servicios adicionales
    IF NEW.servicio_qr THEN
        NEW.precio_servicios_adicionales := NEW.precio_servicios_adicionales + 250;
    END IF;

    IF NEW.servicio_ingles THEN
        NEW.precio_servicios_adicionales := NEW.precio_servicios_adicionales + 200;
    END IF;

    IF NEW.servicio_express THEN
        NEW.precio_servicios_adicionales := NEW.precio_servicios_adicionales + 300;
    END IF;

    -- Calcular precio final
    NEW.precio_final := NEW.precio_base + NEW.precio_servicios_adicionales;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para calcular precio final
CREATE TRIGGER calcular_precio_final_trigger
    BEFORE INSERT OR UPDATE ON ordenes
    FOR EACH ROW
    EXECUTE FUNCTION calcular_precio_final();

-- Función para calcular fecha de entrega
CREATE OR REPLACE FUNCTION calcular_fecha_entrega()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.servicio_express THEN
        -- Entrega express: 6 horas
        NEW.fecha_entrega_estimada := NEW.fecha_orden + INTERVAL '6 hours';
    ELSE
        -- Entrega estándar: 24 horas
        NEW.fecha_entrega_estimada := NEW.fecha_orden + INTERVAL '24 hours';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para calcular fecha de entrega
CREATE TRIGGER calcular_fecha_entrega_trigger
    BEFORE INSERT ON ordenes
    FOR EACH ROW
    EXECUTE FUNCTION calcular_fecha_entrega();

-- ============================================================
-- PASO 12: VISTAS ÚTILES
-- ============================================================

-- Vista de dashboard diario
CREATE VIEW vista_dashboard_diario AS
SELECT 
    DATE(o.fecha_orden) as fecha,
    COUNT(*) as total_ordenes,
    SUM(o.precio_final) as ingresos_totales,
    AVG(o.precio_final) as ticket_promedio,
    COUNT(*) FILTER (WHERE o.estado = 'entregado') as ordenes_entregadas,
    COUNT(*) FILTER (WHERE o.estado = 'en_produccion') as ordenes_en_produccion,
    COUNT(*) FILTER (WHERE o.estado IN ('pendiente', 'pago_pendiente')) as ordenes_pendientes,
    COUNT(*) FILTER (WHERE o.estado = 'borrador') as ordenes_borrador
FROM ordenes o
WHERE o.deleted_at IS NULL
GROUP BY DATE(o.fecha_orden)
ORDER BY fecha DESC;

COMMENT ON VIEW vista_dashboard_diario IS 'Dashboard de ventas e ingresos por día';

-- Vista de órdenes pendientes
CREATE VIEW vista_ordenes_pendientes AS
SELECT 
    o.id,
    o.numero_orden,
    c.nombre_completo as cliente,
    c.whatsapp,
    o.nombre_difunto,
    o.estado,
    o.fecha_orden,
    o.fecha_entrega_estimada,
    o.precio_final,
    u.nombre_completo as editor_asignado,
    o.numero_fotos,
    o.servicio_express
FROM ordenes o
JOIN clientes c ON o.cliente_id = c.id
LEFT JOIN usuarios u ON o.editor_asignado = u.id
WHERE o.estado IN ('pendiente', 'pago_pendiente', 'pago_recibido', 'en_produccion', 'en_revision')
    AND o.deleted_at IS NULL
ORDER BY 
    CASE 
        WHEN o.servicio_express THEN 1 
        ELSE 2 
    END,
    o.fecha_entrega_estimada ASC;

COMMENT ON VIEW vista_ordenes_pendientes IS 'Órdenes que requieren atención, priorizando express';

-- Vista de performance de editores
CREATE VIEW vista_performance_editores AS
SELECT 
    u.id,
    u.nombre_completo,
    u.ordenes_completadas,
    u.tiempo_promedio_produccion,
    COUNT(o.id) as ordenes_activas,
    AVG(EXTRACT(EPOCH FROM (o.fecha_entrega_real - o.fecha_orden))/60)::INTEGER as tiempo_real_promedio
FROM usuarios u
LEFT JOIN ordenes o ON u.id = o.editor_asignado 
    AND o.estado IN ('en_produccion', 'en_revision')
    AND o.deleted_at IS NULL
WHERE u.rol = 'editor' AND u.activo = true
GROUP BY u.id, u.nombre_completo, u.ordenes_completadas, u.tiempo_promedio_produccion
ORDER BY u.ordenes_completadas DESC;

COMMENT ON VIEW vista_performance_editores IS 'Performance de editores con métricas de producción';

-- Vista de clientes con múltiples órdenes
CREATE VIEW vista_clientes_recurrentes AS
SELECT 
    c.id,
    c.nombre_completo,
    c.whatsapp,
    c.ciudad,
    COUNT(o.id) as total_ordenes,
    SUM(o.precio_final) as valor_total,
    MAX(o.fecha_orden) as ultima_orden
FROM clientes c
JOIN ordenes o ON c.id = o.cliente_id
WHERE o.deleted_at IS NULL AND c.deleted_at IS NULL
GROUP BY c.id, c.nombre_completo, c.whatsapp, c.ciudad
HAVING COUNT(o.id) > 1
ORDER BY total_ordenes DESC, valor_total DESC;

COMMENT ON VIEW vista_clientes_recurrentes IS 'Clientes con más de una orden';

-- ============================================================
-- PASO 13: DATOS INICIALES
-- ============================================================

-- Usuario administrador inicial (cambiar password después)
INSERT INTO usuarios (nombre_completo, email, password_hash, rol, activo)
VALUES (
    'Administrador',
    'admin@memorialescelestiales.com',
    '$2a$10$ejemplo_hash_cambiar_despues',
    'admin',
    true
);

-- ============================================================
-- PASO 14: PERMISOS (OPCIONAL)
-- ============================================================

-- Crear usuario de aplicación
-- CREATE USER memoriales_app WITH PASSWORD 'tu_password_seguro_aqui';

-- Dar permisos
-- GRANT CONNECT ON DATABASE memoriales_celestiales TO memoriales_app;
-- GRANT USAGE ON SCHEMA public TO memoriales_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO memoriales_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO memoriales_app;

-- ============================================================
-- PASO 15: QUERIES ÚTILES PARA EL DÍA A DÍA
-- ============================================================

-- Ver todas las tablas creadas
-- \dt

-- Ver estructura de una tabla
-- \d ordenes

-- Contar registros en cada tabla
-- SELECT 'clientes' as tabla, COUNT(*) as registros FROM clientes
-- UNION ALL SELECT 'ordenes', COUNT(*) FROM ordenes
-- UNION ALL SELECT 'pagos', COUNT(*) FROM pagos
-- UNION ALL SELECT 'archivos', COUNT(*) FROM archivos
-- UNION ALL SELECT 'testimonios', COUNT(*) FROM testimonios
-- UNION ALL SELECT 'usuarios', COUNT(*) FROM usuarios;

-- Dashboard de hoy
-- SELECT * FROM vista_dashboard_diario WHERE fecha = CURRENT_DATE;

-- Órdenes pendientes
-- SELECT * FROM vista_ordenes_pendientes;

-- Performance de editores
-- SELECT * FROM vista_performance_editores;

-- ============================================================
-- FIN DEL SCRIPT
-- ============================================================

-- Para ejecutar este script:
-- 1. Conectar a PostgreSQL: sudo -u postgres psql
-- 2. Copiar y pegar todo el script
-- 3. Verificar que todo se creó correctamente
-- 4. Cambiar el password del usuario admin

-- ¡Base de datos lista para usar! 🚀
