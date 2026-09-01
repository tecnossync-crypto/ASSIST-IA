# Plataforma de Voz IA — Arquitectura y plan (v1, septiembre 2026)

SaaS de gestión de llamadas con agente de voz IA, construido sobre la cuenta de Twilio que la empresa cliente ya tiene. La IA atiende primero, graba todo como constancia, y transfiere a un humano cuando hace falta. Se renta como servicio.

- **Modelo:** renta mensual a una empresa específica
- **Telefonía:** Twilio (cuenta/número del cliente)
- **Llamadas:** entrantes y salientes desde el día 1
- **Integraciones externas:** fase final

## Decisiones ya tomadas

- La IA atiende primero; transfiere a un humano si lo amerita.
- Se conecta a la cuenta y número de Twilio existentes del cliente (no proveemos telefonía).
- Toda llamada se graba, se transcribe y queda almacenada como constancia.
- Twilio es la prioridad #1; CRM y plataformas externas al final.

## Arquitectura general (6 piezas)

1. **Twilio** — número del cliente. Recibe/origina llamadas; webhooks apuntan a nuestro backend; grabación por llamada vía Twilio Recordings API.
2. **Servidor de voz IA (WebSocket)** — Twilio conecta el audio de la llamada por WebSocket a este servicio, que habla con el modelo de IA y ejecuta herramientas: agendar, tomar datos, transferir a humano.
3. **Backend API** — webhooks de Twilio (inicio/fin de llamada, grabación lista), lógica de negocio, disparo de llamadas salientes, autenticación del dashboard.
4. **PostgreSQL** — llamadas, transcripciones, resúmenes, contactos, solicitudes, usuarios. Multi-tenant desde el día 1 (`empresa_id` en todo) aunque arranque con un solo cliente.
5. **Storage propio (S3 / Cloudflare R2)** — un job copia cada grabación desde Twilio y luego la borra de Twilio para no pagar doble. La constancia queda bajo nuestro control.
6. **Dashboard (Next.js)** — historial de llamadas con audio, transcripción y resumen; qué pidió cada cliente; búsqueda; métricas. Aquí vive el valor por el que pagan la renta.

## Flujo de llamada entrante

1. El cliente llama al número de la empresa → Twilio dispara el webhook al backend.
2. El backend responde con TwiML: iniciar grabación y conectar el audio por WebSocket al servidor de voz IA.
3. La IA conversa: saluda con el guion de la empresa, entiende qué necesita el cliente, registra datos mediante tool calls.
4. Si amerita humano: la IA llama su herramienta `transferir_a_humano`; el backend redirige con `<Dial>` al agente, pasando el contexto. La grabación sigue corriendo.
5. Al colgar: grabación → storage propio; se genera transcripción y resumen (motivo, solicitud, resultado, seguimiento pendiente); todo aparece en el dashboard.

Las salientes son el mismo flujo al revés: el backend origina la llamada vía la API de Twilio (recordatorios, seguimientos, campañas) y al contestar se conecta el mismo servidor de voz.

## Decisión técnica clave: cómo conectar la voz IA

| Opción | Cómo funciona | Costo aprox. | Lectura |
|---|---|---|---|
| **Twilio ConversationRelay** (recomendada para arrancar) | Twilio maneja STT/TTS, voces e interrupciones y entrega texto por WebSocket; tú conectas el LLM que quieras | $0.07/min + LLM | Menos código, costo predecible, fácil cambiar de modelo |
| **Media Streams + OpenAI Realtime** | Audio crudo directo al modelo de voz de OpenAI (voz a voz) | ~$0.10–0.30/min (estimado) | Voz más natural, pero más costo y más piezas que afinar |

**Recomendación:** arrancar con ConversationRelay para el MVP; evaluar Realtime en fase 2 cuando la naturalidad de la voz sea el diferenciador. El servidor de voz queda aislado justamente para poder cambiarlo sin rehacer nada.

## Modelo de datos (núcleo)

| Tabla | Qué guarda |
|---|---|
| `empresas` | El tenant: nombre, credenciales Twilio (encriptadas), guion/configuración del agente, horarios, números de transferencia |
| `llamadas` | Una fila por llamada: `call_sid`, dirección, origen/destino, duración, estado, si hubo transferencia, costo estimado |
| `grabaciones` | URL en storage propio, duración, hash de integridad (constancia), referencia a la llamada |
| `transcripciones` | Texto completo con hablantes y tiempos + resumen IA: motivo, solicitud, resultado, acción pendiente |
| `contactos` | Clientes de la empresa identificados por número; historial unificado |
| `solicitudes` | Lo que el cliente pidió, extraído por la IA (cotización, reclamo, cita…), con estado de seguimiento |
| `usuarios` | Personal de la empresa: acceso al dashboard, roles, a quién se transfiere |

## Stack recomendado

- **Backend + servidor de voz:** Node.js + TypeScript (Fastify) — mejor soporte de Twilio y SDKs de voz IA
- **Base de datos:** PostgreSQL gestionado (Neon, Supabase o RDS)
- **Storage:** Cloudflare R2 o S3
- **Dashboard:** Next.js + React
- **Hosting:** Railway, Render o Fly.io — el servidor de voz necesita WebSockets persistentes y baja latencia, no serverless

## Roadmap por fases

### Fase 0 — Fundación (~1 semana)
- Acceso a la cuenta Twilio del cliente: API keys con permisos mínimos, inventario de números, verificar aviso legal de grabación.
- Repositorio, entornos dev/prod, base de datos, dominio, hosting.
- Definir con la empresa el guion del agente: saludo, qué resuelve, qué datos toma, cuándo transfiere y a quién.
- **Entregable:** llamada de prueba al número dev que responde con IA y queda grabada.

### Fase 1 — MVP: entrantes con constancia (~3–4 semanas)
- Entrantes atendidas por la IA con el guion real (ConversationRelay).
- Transferencia a humano funcionando (`<Dial>` con contexto).
- Grabación completa → storage propio → transcripción → resumen.
- Dashboard v1: lista de llamadas, reproductor, transcripción, resumen, búsqueda.
- **Entregable:** la empresa lo usa en producción y empieza a pagar la renta.

### Fase 2 — Salientes y operación (~2–3 semanas)
- Salientes: seguimientos y recordatorios desde el dashboard o programados.
- Vista de solicitudes con estados (pendiente / en proceso / resuelta).
- Métricas: volumen, motivos comunes, % transferido, duración media.
- Evaluar upgrade de voz a OpenAI Realtime.
- **Entregable:** ciclo completo de atención y seguimiento.

### Fase 3 — Integraciones externas (según demanda)
- CRM del cliente (Zoho, HubSpot…): contactos y tickets desde las llamadas.
- WhatsApp Business para confirmaciones y seguimiento escrito.
- API y webhooks propios.
- Onboarding de una segunda empresa — la base ya es multi-tenant.
- **Entregable:** de herramienta rentada a producto SaaS replicable.

## Costos operativos estimados por minuto (referencia sept. 2026 — verificar antes de cotizar)

| Concepto | Costo/min aprox. | Nota |
|---|---|---|
| Voz Twilio (entrante, EE. UU.) | $0.0085 | La tarifa real depende del número y país del cliente (RD es distinta) |
| Grabación Twilio | $0.0025 | Más storage propio (~centavos/GB/mes en R2) |
| ConversationRelay | $0.07 | Precio publicado por Twilio; la voz se cobra aparte |
| LLM (texto) | ~$0.01–0.03 | Según modelo |
| **Total aprox. por minuto IA** | **~$0.09–0.11** | Piso para calcular la renta: minutos estimados × costo + margen |

## Siguientes pasos inmediatos

1. Conseguir del cliente: acceso a su consola de Twilio (o API key), número para pruebas, y el guion de cómo quieren que la IA atienda.
2. Definir nombre del producto y monto de la renta (con la tabla de costos como piso).
3. Arrancar Fase 0: esqueleto del proyecto — backend + webhook Twilio + primera llamada grabada.

---
Fuentes: Twilio Conversational AI pricing (twilio.com/en-us/products/conversational-ai/pricing) y tutorial oficial Twilio + OpenAI Realtime.
