# Extensión de Chrome — Teléfono

Abre el panel de teléfono de la plataforma (marcar, ver llamadas recientes, contestar) en una **ventana aparte**, para dejarla a mano mientras trabajas en otras pestañas o programas — sin tener que dejar abierta toda la plataforma.

No está publicada en la Chrome Web Store (eso requiere cuenta de desarrollador y revisión de Google); se instala "sin empaquetar", igual de funcional.

## Instalar

1. **Descárgala directo desde la plataforma**: Configuración → Agentes → "Descargar extensión (.zip)". Descomprime el archivo.
2. Abre `chrome://extensions` en Chrome (o Edge, Brave, cualquier navegador basado en Chromium).
3. Activa **"Modo de desarrollador"** (interruptor arriba a la derecha).
4. Click en **"Cargar extensión sin empaquetar"** (o "Load unpacked").
5. Selecciona la carpeta que descomprimiste (`extension/`).
5. Al instalarse, se abre sola la página de configuración — pon la dirección de tu dashboard (ej. `https://3-147-190-197.sslip.io`, la misma que usas para entrar desde el navegador) y guarda.

Repite estos pasos en la computadora de cada agente que quiera usarla (una extensión sin empaquetar no se sincroniza sola entre computadoras).

## Usar

Click en el ícono de la extensión (barra de arriba del navegador) → se abre una ventana de ~380×640 con el panel de teléfono. Si ya tenías sesión iniciada en el dashboard en ese navegador, entra directo; si no, te pide el login primero (misma pantalla de siempre).

Un segundo click en el ícono enfoca la misma ventana en vez de abrir otra — no se acumulan ventanas.

## Actualizar la dirección del dashboard

Click derecho en el ícono de la extensión → **"Opciones"**, o `chrome://extensions` → **Detalles** de la extensión → **"Opciones de la extensión"**.

## Notas

- La ventana es una ventana normal de Chrome — no queda "siempre encima" de otras apps a nivel del sistema operativo (eso no lo permite ningún navegador). Puedes moverla a un segundo monitor o dejarla en una esquina.
- No hace falta ningún permiso especial de acceso a otras páginas — la extensión solo abre una ventana apuntando a tu propio dashboard, nada de content scripts ni lectura de otras pestañas.
- Si cambias el dominio del dashboard (nuevo servidor, dominio propio, etc.), solo hay que actualizar la URL en Opciones — no hace falta reinstalar nada.
