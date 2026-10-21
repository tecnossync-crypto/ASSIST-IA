-- Llamadas que la IA colgó sola porque quien contestó no era el cliente:
--   numero_inexistente = grabación del operador ("el número no existe", "fuera de servicio")
--   buzon              = buzón de voz / contestador
--   sin_contacto       = un asesor cerró la llamada desde el panel porque no contestaba nadie
ALTER TABLE llamadas ADD COLUMN IF NOT EXISTS resultado_automatico TEXT;
