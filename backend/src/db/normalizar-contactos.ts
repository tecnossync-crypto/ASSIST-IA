import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "dotenv";
import pg from "pg";
import { buildConnectionConfig } from "./connection-config.js";
import { normalizarNumero } from "../lib/telefono.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../../../.env") });

/**
 * Uso puntual (no corre solo, a diferencia de las migraciones): antes de que
 * existiera normalizarNumero() (ver lib/telefono.ts), un mismo cliente podía
 * terminar con VARIOS contactos si su número se guardó con formatos
 * distintos (manual, CSV, Twilio) — cada llamada nueva "no encontraba" al
 * contacto ya existente y creaba otro. Ese fix solo evita duplicados NUEVOS;
 * este script arregla los que ya quedaron en la base:
 *
 *   1. Agrupa los contactos de cada empresa por su número YA normalizado.
 *   2. Donde hay más de uno en el mismo grupo, se queda con uno solo
 *      (preferimos el que ya tenía el formato correcto; si no, el más
 *      antiguo) y le rellena nombre/apellido/etiquetas/datos/notas/
 *      propietario con lo que tenían los demás — nunca pisa un dato que el
 *      sobreviviente ya tenía.
 *   3. Antes de borrar los duplicados, reapunta cualquier llamada,
 *      solicitud o llamada programada que los referenciara al sobreviviente
 *      (si no, "llamadas_programadas" los perdería en cascada).
 *   4. Al resto (contactos sin duplicado, pero con el número en formato
 *      viejo) simplemente les corrige el número.
 *
 * Uso: `docker compose exec backend node dist/db/normalizar-contactos.js`
 * Seguro de correr más de una vez — la segunda vez no encuentra nada que
 * fusionar ni normalizar.
 */

interface Contacto {
  id: string;
  empresa_id: string;
  numero: string;
  nombre: string | null;
  apellido: string | null;
  etiquetas: string[];
  datos: Record<string, string>;
  notas: string | null;
  propietario_usuario_id: string | null;
  creado_en: string;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL no está definido");

  const client = new pg.Client(buildConnectionConfig(connectionString));
  await client.connect();

  try {
    await client.query("BEGIN");

    const { rows: contactos } = await client.query<Contacto>(
      `SELECT id, empresa_id, numero, nombre, apellido, etiquetas, datos, notas, propietario_usuario_id, creado_en
       FROM contactos`
    );

    const grupos = new Map<string, Contacto[]>();
    for (const c of contactos) {
      const clave = `${c.empresa_id}::${normalizarNumero(c.numero)}`;
      const grupo = grupos.get(clave);
      if (grupo) grupo.push(c);
      else grupos.set(clave, [c]);
    }

    let gruposFusionados = 0;
    let contactosEliminados = 0;
    let numerosNormalizadosSinFusion = 0;

    for (const [clave, grupo] of grupos) {
      const numeroNormalizado = clave.split("::")[1];

      if (grupo.length === 1) {
        const [c] = grupo;
        if (c.numero !== numeroNormalizado) {
          await client.query("UPDATE contactos SET numero = $2 WHERE id = $1", [c.id, numeroNormalizado]);
          numerosNormalizadosSinFusion++;
        }
        continue;
      }

      // Sobreviviente: preferimos el que YA tenía el formato correcto (más
      // probable que sea el que se ha estado usando de verdad); si ninguno,
      // el más antiguo.
      const ordenado = [...grupo].sort((a, b) => {
        const aCorrecto = a.numero === numeroNormalizado ? 0 : 1;
        const bCorrecto = b.numero === numeroNormalizado ? 0 : 1;
        if (aCorrecto !== bCorrecto) return aCorrecto - bCorrecto;
        return new Date(a.creado_en).getTime() - new Date(b.creado_en).getTime();
      });
      const [keeper, ...perdedores] = ordenado;
      const idsPerdedores = perdedores.map((p) => p.id);

      const etiquetasFusionadas = Array.from(
        new Set([...(keeper.etiquetas ?? []), ...perdedores.flatMap((p) => p.etiquetas ?? [])])
      );
      const datosFusionados: Record<string, string> = { ...(keeper.datos ?? {}) };
      for (const p of perdedores) {
        for (const [k, v] of Object.entries(p.datos ?? {})) {
          if (!(k in datosFusionados)) datosFusionados[k] = v;
        }
      }
      const nombre = keeper.nombre ?? perdedores.find((p) => p.nombre)?.nombre ?? null;
      const apellido = keeper.apellido ?? perdedores.find((p) => p.apellido)?.apellido ?? null;
      const notas = keeper.notas || perdedores.find((p) => p.notas)?.notas || null;
      const propietarioUsuarioId =
        keeper.propietario_usuario_id ?? perdedores.find((p) => p.propietario_usuario_id)?.propietario_usuario_id ?? null;

      // Reapunta referencias de los perdedores al sobreviviente ANTES de
      // borrarlos — llamadas_programadas tiene ON DELETE CASCADE, así que si
      // no se hace esto se podría perder una llamada programada pendiente.
      await client.query("UPDATE llamadas SET contacto_id = $2 WHERE contacto_id = ANY($1::uuid[])", [
        idsPerdedores,
        keeper.id,
      ]);
      await client.query("UPDATE solicitudes SET contacto_id = $2 WHERE contacto_id = ANY($1::uuid[])", [
        idsPerdedores,
        keeper.id,
      ]);
      await client.query("UPDATE llamadas_programadas SET contacto_id = $2 WHERE contacto_id = ANY($1::uuid[])", [
        idsPerdedores,
        keeper.id,
      ]);

      await client.query(
        `UPDATE contactos SET
           numero = $2, nombre = $3, apellido = $4, etiquetas = $5, datos = $6, notas = $7,
           propietario_usuario_id = $8, actualizado_en = now()
         WHERE id = $1`,
        [keeper.id, numeroNormalizado, nombre, apellido, etiquetasFusionadas, JSON.stringify(datosFusionados), notas, propietarioUsuarioId]
      );

      await client.query("DELETE FROM contactos WHERE id = ANY($1::uuid[])", [idsPerdedores]);

      console.log(
        `Fusionados ${grupo.length} contactos → ${keeper.id} (${numeroNormalizado}, empresa ${keeper.empresa_id}); ` +
          `eliminados: ${idsPerdedores.join(", ")}`
      );
      gruposFusionados++;
      contactosEliminados += idsPerdedores.length;
    }

    await client.query("COMMIT");
    console.log(
      `Listo: ${gruposFusionados} grupo(s) fusionado(s) (${contactosEliminados} contacto(s) eliminado(s)), ` +
        `${numerosNormalizadosSinFusion} número(s) normalizado(s) sin fusión.`
    );
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Error normalizando contactos:", err);
  process.exit(1);
});
