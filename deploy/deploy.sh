#!/usr/bin/env bash
# Despliega producción en ESTE servidor (carpeta ~/app, rama main).
#
#   cd ~/app && bash deploy/deploy.sh
#
# Opciones:
#   --limpio        compila sin caché (más lento; úsalo si algo quedó "pegado")
#   --sin-backup    no respalda la base antes de migrar
#   --si            no pide la confirmación escrita
#
# Qué hace, en orden: trae main, respalda la base, valida Caddy, compila los
# servicios de uno en uno (para no ahogar el servidor mientras hay llamadas),
# los levanta, aplica las migraciones y comprueba que respondan.
set -euo pipefail

LIMPIO=0
SIN_BACKUP=0
SIN_CONFIRMAR=0
for arg in "$@"; do
  case "$arg" in
    --limpio) LIMPIO=1 ;;
    --sin-backup) SIN_BACKUP=1 ;;
    --si) SIN_CONFIRMAR=1 ;;
    *) echo "Opción desconocida: $arg"; exit 1 ;;
  esac
done

RAMA=main
ENV_FILE=.env.production
COMPOSE=(docker compose --env-file .env.production)
SERVICIOS=(backend voice-server dashboard)

paso() { echo; echo "==> $*"; }
falla() { echo; echo "ERROR: $*" >&2; exit 1; }

[ -f "$ENV_FILE" ] || falla "No encuentro $ENV_FILE en $(pwd). ¿Estás en ~/app?"
[ -f docker-compose.yml ] || falla "No encuentro docker-compose.yml: ejecuta esto desde la raíz del proyecto."

valor_env() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }

# --- 1. Traer la rama -------------------------------------------------------
paso "Trayendo la rama '$RAMA'"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  falla "Hay cambios locales sin guardar en este servidor. Revisa con 'git status' (no se despliega encima)."
fi
git fetch origin
git checkout "$RAMA"
git pull --ff-only origin "$RAMA"
export APP_VERSION="$(git rev-parse --short HEAD)"
MENSAJE="$(git log -1 --pretty=%s)"
echo "Versión a desplegar: $APP_VERSION — $MENSAJE"

# --- 2. Confirmar y respaldar -----------------------------------------------
if [ "$SIN_CONFIRMAR" -eq 0 ]; then
  echo
  echo "Vas a desplegar a PRODUCCIÓN la versión $APP_VERSION."
  read -r -p "Escribe PRODUCCION para continuar: " RESPUESTA
  [ "$RESPUESTA" = "PRODUCCION" ] || falla "Cancelado: no escribiste PRODUCCION."
fi

if [ "$SIN_BACKUP" -eq 0 ]; then
  paso "Respaldando la base de datos antes de migrar"
  DB_URL="$(valor_env DATABASE_URL)"
  mkdir -p "$HOME/backups"
  ARCHIVO="$HOME/backups/voz-ia-prod-$(date +%Y%m%d-%H%M).dump"
  # pg_dump debe ser de la MISMA versión (o más nueva) que el servidor: el RDS es
  # PostgreSQL 18. Si algún día el RDS sube de versión, exporta PG_IMAGE
  # (ej. PG_IMAGE=postgres:19-alpine) antes de correr el script.
  # PGSSLMODE=require porque es RDS.
  PG_IMAGE="${PG_IMAGE:-postgres:18-alpine}"
  if docker run --rm -e PGSSLMODE=require -v "$HOME/backups:/respaldos" "$PG_IMAGE" \
      pg_dump "$DB_URL" -Fc -f "/respaldos/$(basename "$ARCHIVO")"; then
    echo "Respaldo guardado en $ARCHIVO"
    ls -1t "$HOME"/backups/voz-ia-prod-*.dump 2>/dev/null | tail -n +11 | xargs -r rm -f
  else
    read -r -p "No se pudo respaldar la base. ¿Continuar SIN respaldo? (escribe SI): " SEGUIR
    [ "$SEGUIR" = "SI" ] || falla "Cancelado: sin respaldo no se despliega."
  fi
fi

# --- 2b. Validar Caddy ANTES de compilar o tocar nada -----------------------
# Una configuración de Caddy mal escrita dejaría sin entrada a Twilio y al
# dashboard. Se prueba en un contenedor aparte, con la configuración nueva.
paso "Validando la configuración de Caddy (si estuviera mal, no se toca nada)"
"${COMPOSE[@]}" run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile \
  || falla "El Caddyfile nuevo no es válido: NO se desplegó nada. Avisa a Claude con este mensaje."

# --- 3. Compilar, de a un servicio (en paralelo gastaría demasiada memoria) --
ARGS_BUILD=()
[ "$LIMPIO" -eq 1 ] && ARGS_BUILD+=(--no-cache)
for servicio in "${SERVICIOS[@]}"; do
  paso "Compilando $servicio"
  "${COMPOSE[@]}" build "${ARGS_BUILD[@]}" "$servicio"
done

# --- 4. Levantar ------------------------------------------------------------
paso "Levantando los servicios"
"${COMPOSE[@]}" up -d

# --- 5. Esperar al backend y migrar ----------------------------------------
paso "Esperando al backend"
LISTO=0
for _ in $(seq 1 45); do
  if "${COMPOSE[@]}" exec -T backend node -e "fetch('http://localhost:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    LISTO=1
    break
  fi
  sleep 2
done
[ "$LISTO" -eq 1 ] || falla "El backend no respondió en 90 s. Revisa: ${COMPOSE[*]} logs --tail 50 backend"

paso "Aplicando migraciones"
"${COMPOSE[@]}" exec -T backend npm run migrate

# --- 6. Comprobación pública ------------------------------------------------
paso "Comprobando que responde por internet"
DOMINIO="$(valor_env PUBLIC_DOMAIN)"
RESPUESTA=""
for _ in 1 2 3 4 5 6; do
  RESPUESTA="$(curl -fsS --max-time 8 "https://$DOMINIO/health" 2>/dev/null || true)"
  [ -n "$RESPUESTA" ] && break
  sleep 5
done
if [ -n "$RESPUESTA" ]; then
  echo "https://$DOMINIO/health -> $RESPUESTA"
else
  echo "AVISO: no respondió https://$DOMINIO/health todavía."
fi

echo
echo "LISTO: producción corre la versión $APP_VERSION — $MENSAJE"
