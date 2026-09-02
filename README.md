# Plataforma de Voz IA

SaaS de gestión de llamadas con agente de voz IA sobre la cuenta de Twilio del cliente. Ver [docs/plataforma-voz-ia.md](docs/plataforma-voz-ia.md) para la arquitectura y el roadmap completos.

## Estructura

- `backend/` — API Fastify + TypeScript: webhooks de Twilio, endpoints internos para el voice-server, lógica de negocio, auth del dashboard (pendiente).
- `voice-server/` — servidor de voz IA: WebSocket con Twilio ConversationRelay, conversa con OpenAI (GPT), ejecuta herramientas (`transferir_a_humano`, `registrar_solicitud`).
- `dashboard/` — Next.js: lista de llamadas con búsqueda/filtro y detalle (audio, transcripción, resumen).
- `docs/` — documentación del proyecto.

## Estado

**Fase 0 — Fundación** (en progreso). Ver checklist en [docs/fase-0-checklist.md](docs/fase-0-checklist.md).

## Cómo se conectan las piezas

1. Twilio recibe la llamada → `POST /webhooks/twilio/voice-inbound` en el backend.
2. El backend responde TwiML: graba, conecta el audio por WebSocket a `voice-server` (ConversationRelay), y deja un `<Redirect>` de respaldo.
3. `voice-server` mantiene la conversación con OpenAI (GPT) y llama al backend (`/internal/...`, con `INTERNAL_API_KEY`) para leer el guion de la empresa, registrar solicitudes, marcar transferencias y guardar la transcripción.
4. Si el agente decide transferir, `voice-server` termina ConversationRelay (`{"type":"end"}`); TwiML cae al `<Redirect>` → `POST /webhooks/twilio/post-relay`, que hace el `<Dial>` real hacia el humano.

## Arranque local

Necesitas 2 procesos corriendo a la vez (backend y voice-server) más PostgreSQL.

```bash
# 1. Variables de entorno (un solo .env en la raíz, compartido por ambos)
cp .env.example .env   # completar credenciales reales, nunca commitear

# 2. Backend
cd backend
npm install
npm run migrate        # aplica backend/src/db/schema.sql
npm run dev             # http://localhost:3001

# 3. Voice-server (otra terminal)
cd ../voice-server
npm install
npm run dev             # ws://localhost:3002/voice-stream

# 4. Dashboard (otra terminal)
cd ../dashboard
npm install
cp .env.local.example .env.local   # completar NEXT_PUBLIC_EMPRESA_ID con el id real
npm run dev                          # http://localhost:3000
```

## Seed de la primera empresa

Antes de poder ver algo en el dashboard hace falta al menos una empresa en la base:

```bash
cd backend
# completar en .env: SEED_EMPRESA_NOMBRE, TWILIO_ACCOUNT_SID/AUTH_TOKEN/PHONE_NUMBER,
# ENCRYPTION_KEY, y opcionalmente SEED_GUION_* / SEED_NUMEROS_TRANSFERENCIA
npm run seed
```

El id que imprime el comando es el que va en `NEXT_PUBLIC_EMPRESA_ID` del dashboard.

## Exponer los servicios a Twilio en desarrollo

Twilio necesita URLs públicas para el webhook y para el WebSocket. Usa un túnel (ngrok, Cloudflare Tunnel) para cada uno y configura:

- Webhook de voz entrante (consola de Twilio, en el número): `https://tu-tunel-backend.example.com/webhooks/twilio/voice-inbound`
- `VOICE_WS_URL` en `.env`: `wss://tu-tunel-voice-server.example.com/voice-stream`
