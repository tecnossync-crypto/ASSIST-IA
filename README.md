# Plataforma de Voz IA

SaaS de gestión de llamadas con agente de voz IA sobre la cuenta de Twilio del cliente. Ver [docs/plataforma-voz-ia.md](docs/plataforma-voz-ia.md) para la arquitectura y el roadmap completos.

## Estructura

- `backend/` — API Fastify + TypeScript: webhooks de Twilio, lógica de negocio, auth del dashboard.
- `voice-server/` — servidor de voz IA (WebSocket con ConversationRelay). Pendiente de Fase 1.
- `dashboard/` — Next.js. Pendiente de Fase 1.
- `docs/` — documentación del proyecto.

## Estado

**Fase 0 — Fundación** (en progreso). Ver checklist en [docs/fase-0-checklist.md](docs/fase-0-checklist.md).

## Backend: arranque local

```bash
cd backend
npm install
cp ../.env.example ../.env   # completar credenciales reales, nunca commitear
npm run migrate              # aplica backend/src/db/schema.sql
npm run dev                  # http://localhost:3001
```

Requiere PostgreSQL corriendo y `DATABASE_URL` configurado en `.env`.

## Exponer el webhook a Twilio en desarrollo

Twilio necesita una URL pública. Usa un túnel (ngrok, Cloudflare Tunnel) apuntando a `localhost:3001` y configura esa URL en la consola de Twilio como webhook de voz entrante:

```
https://tu-tunel.example.com/webhooks/twilio/voice-inbound
```
