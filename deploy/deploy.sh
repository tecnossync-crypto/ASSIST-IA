#!/usr/bin/env bash
# Despliega un ambiente en ESTE servidor.
#
#   bash deploy/deploy.sh qa      # desde ~/app-qa   (rama qa)   -> ambiente de pruebas
#   bash deploy/deploy.sh prod    # desde ~/app      (rama main)  -> producción
#
# Opciones:
#   --limpio        compila sin caché (más lento; úsalo si algo quedó "pegado")
#   --sin-backup    (solo prod) no respalda la base antes de migrar
#   --si            (solo prod) no pide la confirmación escrita
#
# Qué hace, en orden: trae la rama, (prod) respalda la base, compila los
# servicios de uno en uno (para no ahogar el servidor mientras hay llamadas),
# los levanta, aplica las migraciones, y comprueba que respondan.
#
# El flujo es siempre: cambio -> rama qa -> deploy.sh qa -> probar -> pasar a main
# -> deploy.sh prod. Ver docs/entornos-qa-produccion.md.
set -euo pipefail

ENTORNO="${1:-}"
shift || true
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

case "$ENTORNO" in
  qa)
    RAMA=qa
    ENV_FILE=.env.qa
    COMPOSE=(docker compose -p qa --env-file .env.qa -f docker-compose.qa.yml)
    SVC_BACKEND=qa-backend
    SERVICIOS=(qa-backend qa-voice-server qa-dashboard)
    ;;
  prod)
    RAMA=main
    ENV_FILE=.env.production
    COMPOSE=(docker compose --env-file .env.production)
    SVC_BACKEND=backend
    SERVICIOS=(backend voice-server dashboard)
    ;;
  *)
    echo "Uso: bash deploy/deploy.sh qa|prod [--limpio] [--sin-backup] [--si]"
    exit 1
    ;;
esac

paso() { echo; echo "==> $*"; }
falla() { echo; echo "ERROR: $*" >&2; exit 1; }

[ -f "$ENV_FILE" ] || falla "No encuentro $ENV_FILE en $(pwd). ¿Estás en la carpeta correcta? (qa: ~/app-qa, prod: ~/app)"
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

# --- 2. Producción: confirmar y respaldar -----------------------------------
if [ "$ENTORNO" = "prod" ]; then
  # Producción solo debe recibir lo que ya pasó por QA: main tiene que ser lo que está (o estuvo) en qa.
  if git rev-parse --verify -q origin/qa >/dev/null && ! git merge-base --is-ancestor origin/main origin/qa; then
    echo
    echo "AVISO: 'main' tiene cambios que NO están en 'qa' (no pasaron por pruebas)."
  fi

  if [ "$SIN_CONFIRMAR" -eq 0 ]; then
    echo
    echo "Vas a desplegar a PRODUCCIÓN la versión $APP_VERSION."
    echo "Hazlo solo si esta versión ya se probó en QA."
    read -r -p "Escribe PRODUCCION para continuar: " RESPUESTA
    [ "$RESPUESTA" = "PRODUCCION" ] || falla "Cancelado: no escribiste PRODUCCION."
  fi

  if [ "$SIN_BACKUP" -eq 0 ]; then
    paso "Respaldando la base de datos antes de migrar"
    DB_URL="$(valor_env DATABASE_URL)"
    mkdir -p "$HOME/backups"
    ARCHIVO="$HOME/backups/voz-ia-prod-$(date +%Y%m%d-%H%M).dump"
    # postgres:17 sirve para cualquier servidor anterior; PGSSLMODE=require porque es RDS.
    if docker run --rm -e PGSSLMODE=require -v "$HOME/backups:/respaldos" postgres:17-alpine \
        pg_dump "$DB_URL" -Fc -f "/respaldos/$(basename "$ARCHIVO")"; then
      echo "Respaldo guardado en $ARCHIVO"
      ls -1t "$HOME"/backups/voz-ia-prod-*.dump 2>/dev/null | tail -n +11 | xargs -r rm -f
    else
      read -r -p "No se pudo respaldar la base. ¿Continuar SIN respaldo? (escribe SI): " SEGUIR
      [ "$SEGUIR" = "SI" ] || falla "Cancelado: sin respaldo no se despliega a producción."
    fi
  fi
fi

# --- 2b. Producción: validar Caddy ANTES de compilar o tocar nada -----------
# Una configuración de Caddy mal escrita dejaría sin entrada a Twilio y al
# dashboard. Se prueba en un contenedor aparte, con la configuración nueva.
if [ "$ENTORNO" = "prod" ]; then
  paso "Validando la configuración de Caddy (si estuviera mal, no se toca producción)"
  "${COMPOSE[@]}" run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile     || falla "El Caddyfile nuevo no es válido: NO se desplegó nada. Avisa a Claude con este mensaje."
fi

# --- 3. Compilar, de a un servicio (en paralelo gastaría demasiada memoria) --
ARGS_BUILD=()
[ "$LIMPIO" -eq 1 ] && ARGS_BUILD+=(--no-cache)

# QA: la primera vez no existe la empresa de pruebas, así que el dashboard
# (que lleva su id grabado al compilar) se compila después de sembrar la base.
PRIMERA_VEZ_QA=0
if [ "$ENTORNO" = "qa" ] && [ -z "$(valor_env NEXT_PUBLIC_EMPRESA_ID)" ]; then
  PRIMERA_VEZ_QA=1
fi

for servicio in "${SERVICIOS[@]}"; do
  if [ "$PRIMERA_VEZ_QA" -eq 1 ] && [ "$servicio" = "qa-dashboard" ]; then continue; fi
  paso "Compilando $servicio"
  "${COMPOSE[@]}" build "${ARGS_BUILD[@]}" "$servicio"
done

# --- 4. Levantar ------------------------------------------------------------
paso "Levantando los servicios"
if [ "$PRIMERA_VEZ_QA" -eq 1 ]; then
  "${COMPOSE[@]}" up -d qa-backend qa-voice-server
else
  "${COMPOSE[@]}" up -d
fi

# --- 5. Esperar al backend y migrar ----------------------------------------
paso "Esperando al backend"
LISTO=0
for _ in $(seq 1 45); do
  if "${COMPOSE[@]}" exec -T "$SVC_BACKEND" node -e "fetch('http://localhost:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    LISTO=1
    break
  fi
  sleep 2
done
[ "$LISTO" -eq 1 ] || falla "El backend no respondió en 90 s. Revisa: ${COMPOSE[*]} logs --tail 50 $SVC_BACKEND"

paso "Aplicando migraciones"
"${COMPOSE[@]}" exec -T "$SVC_BACKEND" npm run migrate

# --- 6. QA, primera vez: sembrar la empresa y compilar el dashboard ---------
if [ "$PRIMERA_VEZ_QA" -eq 1 ]; then
  paso "Primera vez en QA: creando la empresa de pruebas y su administrador"
  SALIDA="$("${COMPOSE[@]}" exec -T "$SVC_BACKEND" node dist/db/seed.js 2>&1 | tee /dev/stderr)"
  EMPRESA_ID="$(echo "$SALIDA" | grep -oE 'id=[0-9a-f-]{36}' | head -1 | cut -d= -f2)"
  [ -n "$EMPRESA_ID" ] || falla "No pude leer el id de la empresa del seed. Revisa la salida de arriba y completa NEXT_PUBLIC_EMPRESA_ID en .env.qa a mano."
  if grep -q '^NEXT_PUBLIC_EMPRESA_ID=' "$ENV_FILE"; then
    sed -i "s|^NEXT_PUBLIC_EMPRESA_ID=.*|NEXT_PUBLIC_EMPRESA_ID=$EMPRESA_ID|" "$ENV_FILE"
  else
    echo "NEXT_PUBLIC_EMPRESA_ID=$EMPRESA_ID" >> "$ENV_FILE"
  fi
  echo "Empresa de QA: $EMPRESA_ID (guardada en $ENV_FILE)"
  paso "Compilando qa-dashboard"
  "${COMPOSE[@]}" build "${ARGS_BUILD[@]}" qa-dashboard
  "${COMPOSE[@]}" up -d
fi

# --- 7. Comprobación pública ------------------------------------------------
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
  echo "AVISO: no respondió https://$DOMINIO/health todavía (si es QA y es la primera vez, puede tardar en salir el certificado)."
fi

echo
echo "LISTO: $ENTORNO corre la versión $APP_VERSION — $MENSAJE"
if [ "$ENTORNO" = "qa" ]; then
  echo "Pruébalo en: https://$(valor_env DASHBOARD_DOMAIN)"
  echo "Cuando funcione, dile a Claude que lo pase a producción."
fi
