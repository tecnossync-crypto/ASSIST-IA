-- Llamadas pedidas por webhook con fecha/hora (o espera) opcional: la fila de
-- llamadas_programadas apunta a la solicitud original (llamadas_webhook), que
-- es donde vive el prompt que mandó la plataforma externa. Al llegar la hora,
-- el despachador origina la llamada con ese prompt.
ALTER TABLE llamadas_programadas
  ADD COLUMN IF NOT EXISTS llamada_webhook_id UUID REFERENCES llamadas_webhook(id) ON DELETE SET NULL;

ALTER TABLE llamadas_webhook
  ADD COLUMN IF NOT EXISTS programada_para TIMESTAMPTZ;
