import type { FastifyInstance } from "fastify";
import { createRequire } from "node:module";
import { pool } from "../db/pool.js";
import { streamGrabacion } from "../lib/storage.js";

// El paquete "archiver" es CJS y sus tipos no interoperan bien con
// NodeNext/ESM — se carga con require() explícito para evitar líos de
// resolución de módulos, es solo una librería de streaming de zip.
const require = createRequire(import.meta.url);
const archiver = require("archiver") as (format: string, opts?: Record<string, unknown>) => import("archiver").Archiver;

/**
 * Exportación masiva de grabaciones en un solo .zip — para cuando el
 * cliente pide una copia de todo antes de que expiren por retención (ver
 * jobs/limpiar-grabaciones.ts). Arma el zip en streaming (no carga todo en
 * memoria): cada audio se descarga de storage y se agrega al archivo a
 * medida que se va mandando la respuesta.
 */
export async function grabacionesRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { empresaId?: string } }>("/api/grabaciones/exportar", async (req, reply) => {
    const { empresaId } = req.query;
    if (!empresaId) {
      reply.code(400).send({ error: "empresaId es requerido" });
      return;
    }

    const grabaciones = await pool.query<{
      url_storage: string;
      creado_en: string;
      numero_origen: string;
      numero_destino: string;
      direccion: string;
    }>(
      `SELECT g.url_storage, g.creado_en, l.numero_origen, l.numero_destino, l.direccion
       FROM grabaciones g
       JOIN llamadas l ON l.id = g.llamada_id
       WHERE g.empresa_id = $1
       ORDER BY g.creado_en`,
      [empresaId]
    );

    if (grabaciones.rows.length === 0) {
      reply.code(404).send({ error: "No hay grabaciones para exportar" });
      return;
    }

    reply.raw.writeHead(200, {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="grabaciones-${empresaId}.zip"`,
    });

    const archivo = archiver("zip", { zlib: { level: 6 } });
    archivo.on("error", (err: Error) => {
      app.log.error(err, "Error armando el zip de grabaciones");
      reply.raw.destroy(err);
    });
    archivo.pipe(reply.raw);

    for (const g of grabaciones.rows) {
      try {
        const stream = await streamGrabacion(g.url_storage);
        const fecha = new Date(g.creado_en).toISOString().slice(0, 10);
        const numero = (g.direccion === "entrante" ? g.numero_origen : g.numero_destino).replace(/[^\d+]/g, "");
        const nombreArchivo = `${fecha}_${numero}_${g.url_storage.split("/").pop()}`;
        archivo.append(stream, { name: nombreArchivo });
      } catch (err) {
        app.log.warn({ err, urlStorage: g.url_storage }, "No se pudo incluir una grabación en el zip, se omite");
      }
    }

    await archivo.finalize();
  });
}
