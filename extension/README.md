# Extensión de Chrome — Teléfono

Abre el panel de teléfono de la plataforma (marcar, ver llamadas recientes, contestar) en una **ventana aparte**, para dejarla a mano mientras trabajas en otras pestañas o programas — sin tener que dejar abierta toda la plataforma.

No está publicada en la Chrome Web Store (eso requiere cuenta de desarrollador y revisión de Google); se instala "sin empaquetar", igual de funcional.

## Instalar

1. **Descárgala directo desde la plataforma**: Configuración → Agentes → "Descargar extensión (.zip)". Descomprime el archivo.
2. Abre `chrome://extensions` en Chrome (o Edge, Brave, cualquier navegador basado en Chromium).
3. Activa **"Modo de desarrollador"** (interruptor arriba a la derecha).
4. Click en **"Cargar extensión sin empaquetar"** (o "Load unpacked").
5. Selecciona la carpeta que descomprimiste (`extension/`).
5. Al instalarse, se abre sola la página de configuración — pon la dirección de tu dashboard (ej. `https://dashboard.3-147-190-197.sslip.io`: la misma que ves en la barra del navegador al entrar a la plataforma; **no** la de la API/webhooks, que no tiene el panel) y guarda.

Repite estos pasos en la computadora de cada agente que quiera usarla (una extensión sin empaquetar no se sincroniza sola entre computadoras).

## Usar

Click en el ícono de la extensión (barra de arriba del navegador) → se abre una ventana de ~380×640 con el panel de teléfono. Si ya tenías sesión iniciada en el dashboard en ese navegador, entra directo; si no, te pide el login primero (misma pantalla de siempre).

Un segundo click en el ícono enfoca la misma ventana en vez de abrir otra — no se acumulan ventanas.

## Recibir llamadas

Las llamadas que la IA transfiere a un asesor digital suenan **en esta ventana**; no hace falta tener abierto el resto de la plataforma. Lo único que debe cumplirse:

- La ventana de la extensión tiene que estar **abierta** (puede estar minimizada o detrás de otras). Si se cierra, ese asesor deja de recibir llamadas y a los pocos minutos pasa solo a Inactivo.
- El asesor debe estar en **Activo** (selector del panel).
- Al abrir el panel por primera vez, Chrome pide permiso para **notificaciones**: acéptalo. Así, si la ventana está minimizada, aparece un aviso del sistema y al hacer click se trae la ventana al frente.

Durante una llamada, el recuadro de **contexto** (resumen de la IA) se puede **minimizar** con la flecha de su esquina para dejar a la vista los controles; el navegador recuerda esa preferencia. Si entra otra llamada mientras ya atiendes una, no interrumpe la actual: se ofrece a otro asesor.

## Actualizar la dirección del dashboard

Click derecho en el ícono de la extensión → **"Opciones"**, o `chrome://extensions` → **Detalles** de la extensión → **"Opciones de la extensión"**.

## Notas

- La ventana es una ventana normal de Chrome — no queda "siempre encima" de otras apps a nivel del sistema operativo (eso no lo permite ningún navegador). Puedes moverla a un segundo monitor o dejarla en una esquina.
- No hace falta ningún permiso especial de acceso a otras páginas — la extensión solo abre una ventana apuntando a tu propio dashboard, nada de content scripts ni lectura de otras pestañas.
- Si cambias el dominio del dashboard (nuevo servidor, dominio propio, etc.), solo hay que actualizar la URL en Opciones — no hace falta reinstalar nada.
