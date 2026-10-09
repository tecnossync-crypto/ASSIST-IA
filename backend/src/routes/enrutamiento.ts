import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { MAX_MENSAJE_ESPERA, TIPOS_ESPERA, urlAudioValida, type TipoEspera } from "../lib/espera.js";

/**
 * Enrutamiento de las llamadas que la IA transfiere: dónde se atienden
 * (plataforma / central / ambos) y qué extensiones de la central suenan.
 * Fase 1: sin auth todavía, mismo TODO que el resto de /api — por eso TODA
 * consulta acá filtra por empresa_id (nunca se opera solo por id).
 */
const DESTINOS = ["plataforma", "central", "ambos"] as const;
type Destino = (typeof DESTINOS)[number];

const NUMERO_EXTENSION = /^[0-9*#]{1,20}$/;

export async function enrutamientoRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { empresaId?: string } }>("/api/enrutamiento", async (req, reply) => {
    const { empresaId } = req.query;
    if (!empresaId) {
      reply.code(400).send({ error: "empresaId es requerido" });
      return;
    }

    const empresa = await pool.query<{
      enrutamiento_destino: Destino;
      mostrar_resumen_transferencia: boolean;
      cola_espera_activa: boolean;
      cola_espera_max_minutos: number;
      espera_tipo: string;
      espera_audio_url: string | null;
      espera_mensaje: string | null;
      espera_aviso: string | null;
    }>(
      `SELECT enrutamiento_destino, mostrar_resumen_transferencia, cola_espera_activa, cola_espera_max_minutos,
              espera_tipo, espera_audio_url, espera_mensaje, espera_aviso
       FROM empresas WHERE id = $1`,
      [empresaId]
    );
    if (empresa.rows.length === 0) {
      reply.code(404).send({ error: "no encontrada" });
      return;
    }

    const extensiones = await pool.query(
      `SELECT e.id, e.numero, e.nombre, e.cola_id, e.activa, c.nombre AS cola_nombre
       FROM extensiones_central e
       LEFT JOIN colas c ON c.id = e.cola_id AND c.empresa_id = e.empresa_id
       WHERE e.empresa_id = $1
       ORDER BY c.nombre NULLS FIRST, e.numero`,
      [empresaId]
    );

    reply.send({
      destino: empresa.rows[0].enrutamiento_destino,
      mostrarResumen: empresa.rows[0].mostrar_resumen_transferencia,
      colaEspera: {
        activa: empresa.rows[0].cola_espera_activa,
        maxMinutos: empresa.rows[0].cola_espera_max_minutos,
      },
      espera: {
        tipo: empresa.rows[0].espera_tipo,
        audioUrl: empresa.rows[0].espera_audio_url,
        mensaje: empresa.rows[0].espera_mensaje,
        aviso: empresa.rows[0].espera_aviso,
      },
      extensiones: extensiones.rows,
    });
  });

  // Lo que oye el cliente mientras espera: en pausa o tras una transferencia.
  app.put<{
    Body: { empresaId: string; tipo: string; audioUrl?: string | null; mensaje?: string | null; aviso?: string | null };
  }>("/api/enrutamiento/espera", async (req, reply) => {
    const { empresaId, tipo } = req.body ?? {};
    if (!empresaId || !TIPOS_ESPERA.includes(tipo as TipoEspera)) {
      reply.code(400).send({ error: "empresaId y un tipo válido (musica, audio, mensaje, mensaje_musica o silencio) son requeridos" });
      return;
    }
    const audioUrl = req.body.audioUrl?.trim() || null;
    const mensaje = req.body.mensaje?.trim() || null;
    const aviso = req.body.aviso?.trim() || null;

    if (tipo === "audio" && !urlAudioValida(audioUrl)) {
      reply.code(400).send({ error: "El audio debe ser un enlace https público (mp3 o wav)." });
      return;
    }
    if (tipo === "mensaje_musica" && audioUrl && !urlAudioValida(audioUrl)) {
      reply.code(400).send({ error: "La música debe ser un enlace https público (mp3 o wav), o déjala vacía." });
      return;
    }
    if ((tipo === "mensaje" || tipo === "mensaje_musica") && !mensaje) {
      reply.code(400).send({ error: "Escribe el mensaje que se leerá mientras el cliente espera." });
      return;
    }
    if ((mensaje && mensaje.length > MAX_MENSAJE_ESPERA) || (aviso && aviso.length > 300)) {
      reply.code(400).send({ error: `El mensaje admite hasta ${MAX_MENSAJE_ESPERA} caracteres y el aviso hasta 300.` });
      return;
    }

    await pool.query(
      `UPDATE empresas SET espera_tipo = $2, espera_audio_url = $3, espera_mensaje = $4, espera_aviso = $5 WHERE id = $1`,
      [empresaId, tipo, audioUrl, mensaje, aviso]
    );
    reply.send({ ok: true });
  });

  // Cola de espera: si no hay asesores disponibles, el cliente espera en línea
  // (hasta maxMinutos) en vez de que se le cuelgue.
  app.put<{ Body: { empresaId: string; activa: boolean; maxMinutos: number } }>(
    "/api/enrutamiento/cola-espera",
    async (req, reply) => {
      const { empresaId, activa, maxMinutos } = req.body ?? {};
      const minutos = Math.floor(Number(maxMinutos));
      if (!empresaId || typeof activa !== "boolean" || !Number.isFinite(minutos) || minutos < 1 || minutos > 60) {
        reply.code(400).send({ error: "empresaId, activa (true/false) y maxMinutos (1 a 60) son requeridos" });
        return;
      }
      await pool.query("UPDATE empresas SET cola_espera_activa = $2, cola_espera_max_minutos = $3 WHERE id = $1", [
        empresaId,
        activa,
        minutos,
      ]);
      reply.send({ ok: true });
    }
  );

  // Activa/apaga el contexto para el vendedor (resumen de la conversación con
  // el bot en el panel de teléfono cuando se le transfiere una llamada).
  app.put<{ Body: { empresaId: string; activo: boolean } }>("/api/enrutamiento/resumen", async (req, reply) => {
    const { empresaId, activo } = req.body ?? {};
    if (!empresaId || typeof activo !== "boolean") {
      reply.code(400).send({ error: "empresaId y activo (true/false) son requeridos" });
      return;
    }
    await pool.query("UPDATE empresas SET mostrar_resumen_transferencia = $2 WHERE id = $1", [empresaId, activo]);
    reply.send({ ok: true });
  });

  app.put<{ Body: { empresaId: string; destino: Destino } }>("/api/enrutamiento/destino", async (req, reply) => {
    const { empresaId, destino } = req.body;
    if (!empresaId || !DESTINOS.includes(destino)) {
      reply.code(400).send({ error: "empresaId y un destino válido (plataforma, central o ambos) son requeridos" });
      return;
    }
    await pool.query("UPDATE empresas SET enrutamiento_destino = $2 WHERE id = $1", [empresaId, destino]);
    reply.send({ ok: true });
  });

  // Destino propio de una cola; null = usa el de la empresa.
  app.put<{ Params: { id: string }; Body: { empresaId: string; destino: Destino | null } }>(
    "/api/colas/:id/destino",
    async (req, reply) => {
      const { id } = req.params;
      const { empresaId, destino } = req.body;
      if (!empresaId || (destino !== null && !DESTINOS.includes(destino))) {
        reply.code(400).send({ error: "empresaId y un destino válido (o null) son requeridos" });
        return;
      }
      const result = await pool.query(
        "UPDATE colas SET destino_llamadas = $3 WHERE id = $1 AND empresa_id = $2 RETURNING id",
        [id, empresaId, destino]
      );
      if (result.rows.length === 0) {
        reply.code(404).send({ error: "no encontrada" });
        return;
      }
      reply.send({ ok: true });
    }
  );

  app.post<{ Body: { empresaId: string; numero: string; nombre?: string; colaId?: string | null } }>(
    "/api/extensiones",
    async (req, reply) => {
      const { empresaId, nombre, colaId } = req.body;
      const numero = req.body.numero?.trim();
      if (!empresaId || !numero) {
        reply.code(400).send({ error: "empresaId y numero son requeridos" });
        return;
      }
      if (!NUMERO_EXTENSION.test(numero)) {
        reply.code(400).send({ error: "El número de extensión solo puede llevar dígitos, * o # (máx. 20)" });
        return;
      }
      if (colaId) {
        const cola = await pool.query("SELECT 1 FROM colas WHERE id = $1 AND empresa_id = $2", [colaId, empresaId]);
        if (cola.rows.length === 0) {
          reply.code(400).send({ error: "La cola no existe" });
          return;
        }
      }

      try {
        const result = await pool.query(
          `INSERT INTO extensiones_central (empresa_id, cola_id, numero, nombre)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [empresaId, colaId || null, numero, nombre?.trim() || null]
        );
        reply.send({ ok: true, id: result.rows[0].id });
      } catch (err) {
        if ((err as { code?: string }).code === "23505") {
          reply.code(409).send({ error: `La extensión ${numero} ya está registrada` });
          return;
        }
        throw err;
      }
    }
  );

  app.put<{
    Params: { id: string };
    Body: { empresaId: string; nombre?: string | null; colaId?: string | null; activa?: boolean };
  }>("/api/extensiones/:id", async (req, reply) => {
    const { id } = req.params;
    const { empresaId, nombre, colaId, activa } = req.body;
    if (!empresaId) {
      reply.code(400).send({ error: "empresaId es requerido" });
      return;
    }
    if (colaId) {
      const cola = await pool.query("SELECT 1 FROM colas WHERE id = $1 AND empresa_id = $2", [colaId, empresaId]);
      if (cola.rows.length === 0) {
        reply.code(400).send({ error: "La cola no existe" });
        return;
      }
    }

    // colaId viene "" o null para "sin departamento"; undefined = no tocar.
    const cambiaCola = colaId !== undefined;
    const result = await pool.query(
      `UPDATE extensiones_central SET
         nombre = CASE WHEN $3::boolean THEN $4 ELSE nombre END,
         cola_id = CASE WHEN $5::boolean THEN $6::uuid ELSE cola_id END,
         activa = COALESCE($7, activa)
       WHERE id = $1 AND empresa_id = $2
       RETURNING id`,
      [
        id,
        empresaId,
        nombre !== undefined,
        nombre?.trim() || null,
        cambiaCola,
        colaId || null,
        activa ?? null,
      ]
    );
    if (result.rows.length === 0) {
      reply.code(404).send({ error: "no encontrada" });
      return;
    }
    reply.send({ ok: true });
  });

  app.delete<{ Params: { id: string }; Querystring: { empresaId?: string } }>(
    "/api/extensiones/:id",
    async (req, reply) => {
      const { empresaId } = req.query;
      if (!empresaId) {
        reply.code(400).send({ error: "empresaId es requerido" });
        return;
      }
      await pool.query("DELETE FROM extensiones_central WHERE id = $1 AND empresa_id = $2", [
        req.params.id,
        empresaId,
      ]);
      reply.send({ ok: true });
    }
  );
}
