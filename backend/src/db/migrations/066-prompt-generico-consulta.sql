-- Consulta del prompt generico en llamadas de la API. Una regla (o la propia solicitud) puede pedir que, ademas de su
-- guion, la IA tenga a mano el prompt general de la empresa SOLO como informacion de referencia: si el cliente pregunta
-- algo que el guion de la llamada no cubre (precios, coberturas, horarios, procesos), la IA lo busca ahi y vuelve a lo
-- suyo. El guion de la llamada sigue mandando; el prompt general no cambia su rol ni su objetivo.
ALTER TABLE reglas_api_llamadas ADD COLUMN IF NOT EXISTS usar_prompt_generico BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE llamadas_webhook ADD COLUMN IF NOT EXISTS usar_prompt_generico BOOLEAN NOT NULL DEFAULT false;
