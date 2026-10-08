# Ambientes: QA y producción

Todo cambio se prueba primero en **QA** y solo después pasa a **producción**. QA es una copia aislada de la plataforma (su propia base de datos, claves y número de Twilio) que corre en el mismo servidor.

```
 tú pides un cambio ──► rama qa ──► deploy.sh qa ──► pruebas en QA ──► OK ──► rama main ──► deploy.sh prod
                        (Claude)    (servidor)         (tú)                   (Claude)       (servidor)
```

## Cómo están separados

| | Producción | QA |
|---|---|---|
| Rama de git | `main` | `qa` |
| Carpeta en el servidor | `~/app` | `~/app-qa` |
| Dashboard | `https://dashboard.<IP>.sslip.io` | `https://qa-dashboard.<IP>.sslip.io` |
| API / webhooks de Twilio | `https://<IP>.sslip.io` | `https://qa-api.<IP>.sslip.io` |
| Base de datos | la de siempre | `voz_ia_qa` (otra base dentro del mismo RDS, empieza vacía) |
| Claves (`ENCRYPTION_KEY`, `INTERNAL_API_KEY`, `SESSION_SECRET`) | las de producción | **propias**: una sesión o token de QA no sirve en producción |
| Twilio | la cuenta real | una **subcuenta de pruebas** con su propio número |
| Llamadas a teléfonos | libres | **solo a `QA_NUMEROS_PERMITIDOS`** (ver "Candado") |
| Central telefónica (PBX) | conectada | **bloqueada** (QA no marca por la central) |
| Aviso en pantalla | ninguno | franja amarilla "Ambiente de pruebas" y `[QA]` en la pestaña |

Comparten solo: el servidor, el Caddy (HTTPS), y las claves de OpenAI y almacenamiento (los archivos de QA van bajo el id de su propia empresa, no se mezclan).

## El flujo de cada cambio

1. **Pides el cambio.** Claude lo hace y lo sube a la rama `qa` (nunca directo a `main`).
2. **Despliegas a QA** (en el servidor):
   ```bash
   cd ~/app-qa && bash deploy/deploy.sh qa
   ```
3. **Pruebas en QA** usando la lista de abajo. Si algo falla, se corrige en `qa` y se repite.
4. **Das el visto bueno** ("pásalo a producción"). Claude fusiona `qa` en `main` y lo sube.
5. **Despliegas a producción** (en el servidor):
   ```bash
   cd ~/app && bash deploy/deploy.sh prod
   ```
   El script te pide escribir `PRODUCCION`, respalda la base de datos, valida la configuración de Caddy, compila, migra y comprueba que responda.

`deploy.sh` siempre muestra al final **qué versión** quedó corriendo. También se ve en `https://<dominio>/health` (`entorno` y `version`) y, en QA, en la franja amarilla.

## Primera vez (una sola vez)

En el servidor, desde la carpeta de producción:

```bash
cd ~/app && git pull origin main
bash deploy/qa-preparar.sh
```

Crea la base de QA, clona `~/app-qa`, genera `~/app-qa/.env.qa` con claves nuevas y anota los dominios de QA. Luego sigue lo que imprime:

1. Edita `~/app-qa/.env.qa` y completa:
   - `QA_NUMEROS_PERMITIDOS`: los teléfonos del equipo a los que QA puede llamar (ej. `+18095551234,+18295557788`).
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`: los de la **subcuenta de pruebas** (ver abajo).
   - `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD`: con qué entras al dashboard de QA.
2. Que Caddy sirva los dominios de QA (corte de 1–2 segundos en producción; hazlo en un momento tranquilo):
   ```bash
   cd ~/app && docker compose --env-file .env.production up -d --no-deps caddy
   ```
3. Primer deploy de QA (compila, migra, crea la empresa de pruebas y tu administrador):
   ```bash
   cd ~/app-qa && bash deploy/deploy.sh qa
   ```

## Twilio de pruebas

QA debe tener su **propio** número, para que ninguna prueba toque el de producción:

1. En la consola de Twilio crea una **subcuenta** (Account → Subaccounts), por ejemplo "QA".
2. Compra un número en esa subcuenta y, en su configuración de voz, pon el webhook de llamadas entrantes:
   `https://qa-api.<IP>.sslip.io/webhooks/twilio/voice-inbound` (método POST).
3. Copia el SID y el token de la subcuenta a `.env.qa` (`TWILIO_*`) **antes** del primer deploy de QA.
4. Lo demás (clave de API del teléfono del navegador, voz, etc.) se configura en las pantallas de Configuración de QA, igual que en producción.

## El candado de QA

Aunque alguien importe contactos reales a QA o ponga una campaña en marcha por error, **QA no puede llamar** a nadie que no esté en `QA_NUMEROS_PERMITIDOS`: el sistema rechaza la llamada con el mensaje `[QA] Llamada bloqueada…`. Tampoco marca por la central (SIP). Solo se permite llamar a los navegadores de los asesores (el panel de teléfono). Si la lista está vacía, no se llama a ningún teléfono.

Consecuencia: **lo que depende de la central real no se prueba en QA** (transferencia a extensiones, DISA, salida por Claro). Esas partes se validan con cuidado en producción, o más adelante con una central de pruebas.

## Qué probar antes de pasar a producción

Siempre:
- [ ] Entrar al dashboard de QA y navegar las pantallas del cambio.
- [ ] Hacer una llamada a tu número de pruebas y que la IA conteste.
- [ ] El panel de teléfono: ponerse Activo, recibir una llamada, ver el resumen, colgar.
- [ ] Que la llamada termine y quede la grabación y la transcripción.

Según el cambio: la cola de espera (sin asesores activos), el enrutamiento digital, reglas del API (con `curl` al `qa-api`), exportar grabaciones, flujos de trabajo.

## Volver atrás (rollback)

Si producción queda mal después de desplegar:

1. Mira qué versión estaba antes (`git log --oneline -5` en `~/app`).
2. Vuelve a ella: `cd ~/app && git checkout <hash-anterior>` y compila/levanta con
   `docker compose --env-file .env.production build backend dashboard voice-server && docker compose --env-file .env.production up -d`.
3. Después, para volver a `main`: `git checkout main`.

Las migraciones recientes solo **agregan** columnas y tablas, así que volver al código anterior suele ser seguro (la base nueva sigue funcionando con el código viejo). Si algún día una migración borra algo, se avisará antes de pasarla a producción. Si hiciera falta recuperar datos, los respaldos de antes de cada despliegue están en `~/backups/voz-ia-prod-*.dump` (se guardan los últimos 10) y se restauran con `pg_restore`.

## Límites y mantenimiento

- QA comparte CPU y memoria con producción. `deploy.sh` compila **de a un servicio** para cuidarlo, pero conviene desplegar a QA cuando no haya mucho tráfico. Si el servidor se queda corto, se puede mover QA a otra instancia: los mismos scripts sirven.
- Cada despliegue deja imágenes viejas de Docker. De vez en cuando: `docker image prune -f`.
- La rama `main` debería protegerse en GitHub (Settings → Branches) para que nadie suba directo sin pasar por `qa`.
- Cada cambio en `qa` y `main` lo revisa GitHub automáticamente (que compile); mira la pestaña **Actions** del repositorio.
