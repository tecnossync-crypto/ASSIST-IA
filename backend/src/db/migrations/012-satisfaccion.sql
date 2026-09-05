-- El bot clasifica la satisfacción del cliente al terminar cada llamada
-- (basado solo en la transcripción, mismo criterio anti-invención que el
-- resto del resumen) para poder medir % de satisfacción en el dashboard.
ALTER TABLE transcripciones ADD COLUMN IF NOT EXISTS satisfaccion TEXT
  CHECK (satisfaccion IN ('positiva', 'neutral', 'negativa'));
