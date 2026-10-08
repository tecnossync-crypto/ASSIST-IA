#!/usr/bin/env bash
# Prepara el ambiente de QA en este servidor. Se corre UNA sola vez, desde la
# carpeta de producción (~/app):
#
#   cd ~/app && bash deploy/qa-preparar.sh
#
# Qué hace (no toca los contenedores de producción):
#   1. Crea la base de datos de QA (otra base dentro del mismo RDS; vacía).
#   2. Clona el proyecto en ~/app-qa (rama qa).
#   3. Genera ~/app-qa/.env.qa con claves NUEVAS y dominios propios, copiando de
#      producción solo lo que se puede compartir sin riesgo (OpenAI y storage).
#   4. Anota los dominios de QA en .env.production para que Caddy los sirva.
#
# Después sigue lo que imprime al final (editar .env.qa, reiniciar Caddy, primer
# deploy de QA). Guía completa: docs/entornos-qa-produccion.md
set -euo pipefail

DESTINO="${QA_DIR:-$HOME/app-qa}"
BASE_QA="${QA_DB_NAME:-voz_ia_qa}"
ENV_PROD=.env.production

paso() { echo; echo "==> $*"; }
falla() { echo; echo "ERROR: $*" >&2; exit 1; }
valor_prod() { grep -E "^$1=" "$ENV_PROD" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }

[ -f "$ENV_PROD" ] || falla "No encuentro $ENV_PROD. Ejecuta esto desde ~/app (la carpeta de producción)."
[ -f docker-compose.qa.yml ] || falla "Falta docker-compose.qa.yml: haz 'git pull origin main' primero."
[ ! -e "$DESTINO" ] || falla "$DESTINO ya existe. Si quieres rehacer QA, bórralo primero (y la base $BASE_QA si quieres empezar de cero)."

PUBLIC_DOMAIN="$(valor_prod PUBLIC_DOMAIN)"
[ -n "$PUBLIC_DOMAIN" ] || falla "No encuentro PUBLIC_DOMAIN en $ENV_PROD."
QA_API="qa-api.${PUBLIC_DOMAIN}"
QA_DASH="qa-dashboard.${PUBLIC_DOMAIN}"
echo "Dominios de QA: https://$QA_API  y  https://$QA_DASH"
case "$PUBLIC_DOMAIN" in
  *sslip.io|*nip.io) ;;
  *) echo "NOTA: tu dominio no es sslip.io; crea en tu DNS los registros A de $QA_API y $QA_DASH hacia la IP de este servidor." ;;
esac

# --- 1. Base de datos de QA -------------------------------------------------
paso "Creando la base de datos '$BASE_QA' (dentro del mismo RDS)"
BASE_QA="$BASE_QA" docker compose --env-file "$ENV_PROD" exec -T -e BASE_QA backend node --input-type=module <<'JS'
import pg from "pg";
import { buildConnectionConfig } from "/app/dist/db/connection-config.js";

const nombre = process.env.BASE_QA;
if (!/^[a-z0-9_]{3,40}$/.test(nombre)) throw new Error("Nombre de base inválido: " + nombre);

const cliente = new pg.Client(buildConnectionConfig(process.env.DATABASE_URL));
await cliente.connect();
try {
  const existe = await cliente.query("SELECT 1 FROM pg_database WHERE datname = $1", [nombre]);
  if (existe.rows.length > 0) {
    console.log(`La base ${nombre} ya existía, se reutiliza.`);
  } else {
    await cliente.query(`CREATE DATABASE ${nombre}`);
    console.log(`Base ${nombre} creada.`);
  }
} finally {
  await cliente.end();
}
JS

# URL de la base de QA = la de producción cambiando solo el nombre de la base.
DB_QA_URL="$(docker compose --env-file "$ENV_PROD" exec -T -e BASE_QA="$BASE_QA" backend node -e '
const u = new URL(process.env.DATABASE_URL);
u.pathname = "/" + process.env.BASE_QA;
console.log(u.toString());
' | tr -d '\r')"
[ -n "$DB_QA_URL" ] || falla "No pude armar la URL de la base de QA."

# --- 2. Clonar el proyecto --------------------------------------------------
paso "Clonando el proyecto en $DESTINO (rama qa)"
REMOTO="$(git remote get-url origin)"
git clone --branch qa "$REMOTO" "$DESTINO" || falla "No pude clonar la rama 'qa'. ¿Existe en GitHub? (git push -u origin qa)"

# --- 3. .env.qa -------------------------------------------------------------
paso "Generando $DESTINO/.env.qa"
SECRETO() { openssl rand -hex 32; }

# Se copia todo de producción EXCEPTO lo que cambia en QA.
grep -vE '^(DATABASE_URL|PUBLIC_BASE_URL|VOICE_WS_URL|BACKEND_INTERNAL_URL|ENCRYPTION_KEY|INTERNAL_API_KEY|SESSION_SECRET|PUBLIC_DOMAIN|DASHBOARD_DOMAIN|NEXT_PUBLIC_EMPRESA_ID|TWILIO_ACCOUNT_SID|TWILIO_AUTH_TOKEN|TWILIO_PHONE_NUMBER|QA_PUBLIC_DOMAIN|QA_DASHBOARD_DOMAIN|ENTORNO|QA_NUMEROS_PERMITIDOS|RED_PROD)=' "$ENV_PROD" > "$DESTINO/.env.qa" || true

cat >> "$DESTINO/.env.qa" <<ENV

# ============ Ambiente de QA (generado por deploy/qa-preparar.sh) ============
ENTORNO=qa
DATABASE_URL=$DB_QA_URL
PUBLIC_DOMAIN=$QA_API
DASHBOARD_DOMAIN=$QA_DASH
PUBLIC_BASE_URL=https://$QA_API
VOICE_WS_URL=wss://$QA_API/voice-stream
BACKEND_INTERNAL_URL=http://qa-backend:3001
# Claves PROPIAS de QA: así una sesión o un token de QA no sirve en producción.
ENCRYPTION_KEY=$(SECRETO)
INTERNAL_API_KEY=$(SECRETO)
SESSION_SECRET=$(SECRETO)
# Lo llena deploy.sh solo, la primera vez, con la empresa de pruebas.
NEXT_PUBLIC_EMPRESA_ID=

# --- A COMPLETAR TÚ (ver docs/entornos-qa-produccion.md) --------------------
# Teléfonos a los que QA SÍ puede llamar, separados por coma. Sin esto, QA no
# llama a ningún teléfono (es lo más seguro). Pon aquí los números del equipo.
QA_NUMEROS_PERMITIDOS=
# Cuenta de Twilio SOLO para pruebas (una subcuenta con su número). NO uses las de producción.
TWILIO_ACCOUNT_SID=PENDIENTE
TWILIO_AUTH_TOKEN=PENDIENTE
TWILIO_PHONE_NUMBER=+15550000000
# Con quién entras al dashboard de QA.
SEED_EMPRESA_NOMBRE=Empresa de pruebas (QA)
SEED_ADMIN_EMAIL=
SEED_ADMIN_PASSWORD=
ENV
chmod 600 "$DESTINO/.env.qa"

# --- 4. Dominios de QA para el Caddy de producción --------------------------
paso "Anotando los dominios de QA en $ENV_PROD"
for par in "QA_PUBLIC_DOMAIN=$QA_API" "QA_DASHBOARD_DOMAIN=$QA_DASH"; do
  clave="${par%%=*}"
  if grep -q "^$clave=" "$ENV_PROD"; then
    sed -i "s|^$clave=.*|$par|" "$ENV_PROD"
  else
    echo "$par" >> "$ENV_PROD"
  fi
done

# La red de producción (donde vive Caddy) a la que se unen los contenedores de QA:
# docker compose la llama "<carpeta>_default" (en ~/app es app_default).
RED="$(basename "$PWD" | tr "A-Z" "a-z" | tr -cd "a-z0-9_-")_default"
if docker network inspect "$RED" >/dev/null 2>&1; then
  echo "RED_PROD=$RED" >> "$DESTINO/.env.qa"
  echo "Red de producción detectada: $RED"
else
  echo "AVISO: no encontré la red $RED. Mira cuál es con: docker network ls  — y pon su nombre en RED_PROD=... dentro de $DESTINO/.env.qa"
fi

cat <<FIN

LISTO. Falta lo siguiente (en este orden):

 1. Edita $DESTINO/.env.qa y completa:
      QA_NUMEROS_PERMITIDOS, TWILIO_* (subcuenta de pruebas), SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD.
 2. Que Caddy sirva los dominios de QA (corte de 1-2 segundos en producción, hazlo en un momento tranquilo):
      cd ~/app && git pull origin main && docker compose --env-file .env.production up -d caddy
 3. Primer deploy de QA (compila, migra, crea la empresa de pruebas y su administrador):
      cd $DESTINO && bash deploy/deploy.sh qa
 4. Entra a https://$QA_DASH con el email y la contraseña de SEED_ADMIN_*.
FIN
