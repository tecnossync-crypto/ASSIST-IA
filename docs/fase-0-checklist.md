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
  - [x] Resumen automático (motivo/solicitud/resultado/acción pendiente) generado por Claude al colgar.
- [x] Job de grabación: descarga desde Twilio → sube a storage propio (S3/R2) → hash SHA-256 → borra en Twilio.
- [x] Encriptación (AES-256-GCM) del `twilio_auth_token` por empresa (`ENCRYPTION_KEY`).
- [x] Seed (`npm run seed` en backend): inserta la empresa desde variables de entorno (`SEED_*`, `TWILIO_*`).
- [x] API de lectura (`GET /api/llamadas`, `GET /api/llamadas/:id`) para el dashboard — **sin autenticación todavía**, ver TODO en [backend/src/routes/llamadas.ts](../backend/src/routes/llamadas.ts).
- [x] Dashboard v1 (Next.js): lista con búsqueda/filtro por estado, detalle con reproductor (URL firmada), transcripción y resumen.
- [ ] Probar de punta a punta con una llamada real (requiere número Twilio + túneles de dev).
- [ ] Autenticación del dashboard (tabla `usuarios`, login) antes de exponerlo fuera de localhost.

## Entregable de Fase 0

Llamada de prueba al número dev que:
1. Responde con la IA (aunque sea con un guion mínimo de prueba).
2. Queda grabada y la grabación llega a storage propio.
3. Aparece un registro en la tabla `llamadas`.
