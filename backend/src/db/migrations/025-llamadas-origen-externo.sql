-- Para el "click-to-call" desde una plataforma de terceros (CRM u otra):
-- cuando una llamada normal (con agentes, no IA) la originó un webhook
-- externo en vez del dashboard, queda marcada acá con el mismo `origen`
-- libre que ya se usa en llamadas_webhook — así el widget de la plataforma
-- puede distinguirla y mostrarla en su mini panel.
ALTER TABLE llamadas ADD COLUMN IF NOT EXISTS origen_externo TEXT;
