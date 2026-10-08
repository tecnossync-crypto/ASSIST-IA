import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { normalizarNumero } from "../lib/telefono.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TURNOS = 14;
const MAX_TEXTO_TURNO = 400;

interface Turno {
  hablante: "agente" | "cliente";
  texto: string;
}

/**
 * Contexto de las llamadas que la IA acaba de transferir a una persona
 * (vendedor): qué quiere el cliente, lo que ya dijo y los datos que el bot le
 * capturó, para que quien contesta no empiece de cero. Lo consume el panel de
 * teléfono del dashboard (pestaña "Contexto"). El resumen ya está guardado
 * cuando la llamada llega al humano: el voice-server lo genera ANTES de cerrar
 * la sesión del bot (ver server.ts → session.finalizar()).
 *
 * Todo filtra por empresa_id. Con colaId (operadores) solo se ven las de su
 * departamento y las que no tienen departamento asignado.
 */
export async function contextoTransferenciasRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { empresaId?: string; colaId?: string; minutos?: string } }>(
    "/api/llamadas/transferidas-recientes",
    async (req, reply) => {
      const { empresaId, colaId } = req.query;
      if (!empresaId) {
        reply.code(400).send({ error: "empresaId es requerido" });
        return;
      }
      const minutos = Math.min(Math.max(parseInt(req.query.minutos ?? "30", 10) || 30, 1), 240);
      const cola = colaId && UUID.test(colaId) ? colaId : null;

      const empresa = await pool.query<{ mostrar: boolean }>(
        "SELECT mostrar_resumen_transferencia AS mostrar FROM empresas WHERE id = $1",
        [empresaId]
      );
      if (empresa.rows.length === 0) {
        reply.code(404).send({ error: "no encontrada" });
        return;
      }
      if (!empresa.rows[0].mostrar) {
        reply.send({ activo: false, llamadas: [] });
        return;
      }

      const filas = await pool.query(
        `SELECT l.id, l.direccion, l.numero_origen, l.numero_destino, l.estado, l.iniciada_en,
                l.contacto_id, l.cola_id, c.nombre AS cola_nombre,
                t.resumen_motivo, t.resumen_solicitud, t.resumen_resultado, t.accion_pendiente,
                t.satisfaccion, t.texto_completo, t.creado_en AS resumen_en
         FROM llamadas l
         LEFT JOIN colas c ON c.id = l.cola_id AND c.empresa_id = l.empresa_id
         LEFT JOIN LATERAL (
           SELECT resumen_motivo, resumen_solicitud, resumen_resultado, accion_pendiente,
                  satisfaccion, texto_completo, creado_en
           FROM transcripciones WHERE llamada_id = l.id ORDER BY creado_en DESC LIMIT 1
         ) t ON true
         WHERE l.empresa_id = $1
           AND l.transferida = true
           AND l.iniciada_en > now() - ($2 || ' minutes')::interval
           AND ($3::uuid IS NULL OR l.cola_id IS NULL OR l.cola_id = $3::uuid)
         ORDER BY COALESCE(t.creado_en, l.iniciada_en) DESC
         LIMIT 5`,
        [empresaId, String(minutos), cola]
      );

      const ids = filas.rows.map((f) => f.id as string);
      const numeroCliente = (f: { direccion: string; numero_origen: string; numero_destino: string }) =>
        f.direccion === "entrante" ? f.numero_origen : f.numero_destino;

      const [datosCapturados, contactos] = await Promise.all([
        ids.length
          ? pool.query<{ llamada_id: string; campo: string; valor: string }>(
              `SELECT llamada_id, campo, valor FROM datos_llamada
               WHERE empresa_id = $1 AND llamada_id = ANY($2::uuid[]) ORDER BY creado_en`,
              [empresaId, ids]
            )
          : { rows: [] as { llamada_id: string; campo: string; valor: string }[] },
        ids.length
          ? pool.query<{
              id: string;
              numero: string;
              nombre: string | null;
              apellido: string | null;
              etiquetas: string[];
              datos: Record<string, unknown>;
            }>(
              `SELECT id, numero, nombre, apellido, etiquetas, datos FROM contactos
               WHERE empresa_id = $1 AND (id = ANY($2::uuid[]) OR numero = ANY($3::text[]))`,
              [
                empresaId,
                filas.rows.map((f) => f.contacto_id).filter(Boolean),
                filas.rows.map((f) => normalizarNumero(numeroCliente(f))),
              ]
            )
          : { rows: [] },
      ]);

      const llamadas = filas.rows.map((f) => {
        const numero = numeroCliente(f);
        const contacto =
          contactos.rows.find((c) => c.id === f.contacto_id) ??
          contactos.rows.find((c) => c.numero === normalizarNumero(numero));

        const turnos: Turno[] = Array.isArray(f.texto_completo)
          ? (f.texto_completo as Turno[])
              .filter((t) => t && typeof t.texto === "string" && t.texto.trim())
              .slice(-MAX_TURNOS)
              .map((t) => ({ hablante: t.hablante, texto: t.texto.trim().slice(0, MAX_TEXTO_TURNO) }))
          : [];

        return {
          id: f.id,
          estado: f.estado,
          iniciada_en: f.iniciada_en,
          resumen_en: f.resumen_en,
          numero,
          cola_nombre: f.cola_nombre,
          // Si el resumen todavía se está generando (el LLM tarda unos segundos
          // tras cortar al bot), el panel muestra "Generando resumen…".
          resumen_listo: f.resumen_en !== null,
          contacto: contacto
            ? {
                nombre: contacto.nombre,
                apellido: contacto.apellido,
                etiquetas: contacto.etiquetas ?? [],
                datos: contacto.datos ?? {},
              }
            : null,
          resumen: {
            motivo: f.resumen_motivo,
            solicitud: f.resumen_solicitud,
            resultado: f.resumen_resultado,
            accion_pendiente: f.accion_pendiente,
            satisfaccion: f.satisfaccion,
          },
          datos_capturados: datosCapturados.rows
            .filter((d) => d.llamada_id === f.id)
            .map((d) => ({ campo: d.campo, valor: d.valor })),
          turnos,
        };
      });

      reply.send({ activo: true, llamadas });
    }
  );
}
