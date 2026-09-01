# Fase 0 — Checklist de fundación

## Pendiente del cliente (bloqueante)

- [ ] Acceso a la cuenta de Twilio: API Key + Secret con permisos mínimos (no el Auth Token maestro si se puede evitar).
- [ ] Inventario de números Twilio activos del cliente.
- [ ] Número de prueba (puede ser el mismo, apuntado primero a un entorno dev).
- [ ] Confirmar que el cliente tiene el aviso legal de "esta llamada será grabada" en su guion/aviso al público (requisito legal, varía por país).
- [ ] Guion del agente: saludo, qué resuelve, qué datos toma, cuándo transfiere y a qué número/persona.

## Infraestructura

- [x] Repositorio creado (`ASSIST-IA`).
- [ ] Base de datos PostgreSQL (Neon/Supabase/RDS) — entorno dev.
- [ ] Variables de entorno reales cargadas (nunca commiteadas) en dev.
- [ ] Hosting elegido para backend + voice-server (Railway/Render/Fly.io — necesita WebSockets persistentes).
- [ ] Dominio o subdominio para el webhook público de dev.
- [ ] Túnel (ngrok/Cloudflare Tunnel) para exponer localhost mientras no hay hosting.

## Código (este repo)

- [x] Esqueleto backend Fastify + TypeScript.
- [x] Esquema PostgreSQL multi-tenant (`empresa_id` en todo).
- [x] Webhook `/webhooks/twilio/voice-inbound` (TwiML: graba + conecta a ConversationRelay).
- [x] Webhook `/webhooks/twilio/call-status` (actualiza estado/duración).
- [x] Webhook `/webhooks/twilio/recording-status` (placeholder, falta el job de descarga).
- [x] Webhook `/webhooks/twilio/post-relay` (resuelve `<Dial>` cuando el agente pidió transferencia).
- [x] Endpoints internos backend↔voice-server (`/internal/...`, protegidos con `INTERNAL_API_KEY`).
- [x] `voice-server`: servidor WebSocket (ConversationRelay) que conversa con Claude y ejecuta herramientas.
  - [x] Herramienta `transferir_a_humano` (marca destino + termina ConversationRelay).
  - [x] Herramienta `registrar_solicitud` (inserta en `solicitudes`).
  - [x] Guarda transcripción cruda al colgar.
  - [ ] Resumen automático (motivo/solicitud/resultado) — hoy queda solo el texto crudo, falta el paso de resumen.
- [ ] Job de grabación: descargar desde Twilio → subir a storage propio → hash de integridad → borrar en Twilio.
- [ ] Seed: insertar la primera fila en `empresas` con los datos reales del cliente (incluye `guion_agente` y `numeros_transferencia`, que ahora sí usa el agente en vivo).
- [ ] Probar de punta a punta con una llamada real (requiere número Twilio + túneles de dev).

## Entregable de Fase 0

Llamada de prueba al número dev que:
1. Responde con la IA (aunque sea con un guion mínimo de prueba).
2. Queda grabada y la grabación llega a storage propio.
3. Aparece un registro en la tabla `llamadas`.
