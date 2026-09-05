-- Soporte para monitoreo de llamadas en vivo: "llamada normal" ahora corre
-- dentro de una conferencia de Twilio (cliente + agente, cada uno su propia
-- pierna) en vez de un <Dial><Client> directo, para que el admin pueda
-- unirse a escuchar (y opcionalmente intervenir) sin que nadie más lo note.
ALTER TABLE llamadas ADD COLUMN IF NOT EXISTS conferencia_nombre TEXT;
ALTER TABLE llamadas ADD COLUMN IF NOT EXISTS agente_call_sid TEXT; -- pierna del agente que contestó (para poder unir al admin a esa conferencia)
ALTER TABLE llamadas ADD COLUMN IF NOT EXISTS agentes_call_sids TEXT[] NOT NULL DEFAULT '{}'; -- todas las piernas de agente que se marcaron para esta llamada (para cancelar las que no contestaron)
