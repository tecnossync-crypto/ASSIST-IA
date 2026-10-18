# Gestión de Llamadas — app de escritorio (Windows)

App de escritorio para los asesores. No duplica la plataforma: abre **tu mismo dashboard** en dos ventanas, así que cada mejora del dashboard le llega sola.

- **Ventana principal:** el sistema de gestión completo (llamadas, contactos, campañas, configuración según el rol).
- **Teléfono flotante (widget):** queda **pegado al borde izquierdo** de la pantalla como una **burbuja** pequeña, siempre encima de las demás ventanas. Con **un clic** se abre el panel (marcar, contactos, recientes, cola, contexto de la IA, llamadas entrantes); con el botón **—** vuelve a ser burbuja. Se puede **arrastrar** a donde se quiera y se pega solo al borde más cercano (izquierdo o derecho). La burbuja muestra el estado del asesor, el cronómetro durante una llamada y una insignia con los avisos pendientes. Cuando entra una llamada se abre sola, con notificación de Windows. Es la única ventana que registra el teléfono, así que las llamadas no suenan dos veces.
- **Bandeja del sistema** (junto al reloj): cerrar la ventana principal no desconecta al asesor. Menú con: abrir el sistema, mostrar/ocultar teléfono, lado de la pantalla, *Abrir con Windows*, ajustes, salir.
- **Atajo global:** `Ctrl + Alt + P` abre/contrae el teléfono (o lo muestra si estaba oculto).
- **Se actualiza sola** (ver "Publicar una versión").

La dirección de la plataforma viene de fábrica en `config.json` y se puede cambiar en *Ajustes* (menú de la bandeja).

## Generar el instalador

Requiere Node.js. En esta carpeta:

```bash
npm install
npm run dist
```

Sale en `dist/`: `Gestion-de-Llamadas-Setup.exe` (~80 MB), `Gestion-de-Llamadas-Setup.exe.blockmap` y `latest.yml`.

Para probarla sin instalar: `npm start`.

## Publicar una versión

El instalador **no va en git** (pesa ~80 MB). Se copia al servidor, a la carpeta que sirve el dashboard:

1. Sube los **3 archivos** de `dist/` a `~/app/dashboard/public/descargas/` en el servidor.
2. Reconstruye el dashboard: `cd ~/app && bash deploy/deploy.sh` (la imagen copia `public/` al construirse).

Desde ese momento aparece el botón **"Descargar para Windows (.exe)"** en Configuración → Agentes, y las apps ya instaladas encuentran `latest.yml` y se actualizan solas (la app lo revisa al abrir y cada 4 horas; se instala al cerrarla o con *Reiniciar para actualizar* en la bandeja).

Para sacar una nueva versión: sube `"version"` en `package.json`, vuelve a generar y repite los dos pasos.

## Aviso de Windows (sin certificado)

La app no está firmada con certificado de código, así que la **primera vez** Windows muestra *"Windows protegió su PC"*. Se acepta con **Más información → Ejecutar de todas formas**. Es normal y no vuelve a salir (ni en las actualizaciones). Si en el futuro se compra un certificado, se configura en `build.win` de `package.json` y desaparece el aviso.

## Notas técnicas

- El dashboard reconoce la app por la marca `GLDesktop-main` / `GLDesktop-mini` en el User-Agent: la ventana principal no registra el teléfono (ver `dashboard/app/(app)/layout.tsx`). La burbuja y el panel son el mismo componente web (`PanelTelefono` + `BurbujaTelefono`); la app solo cambia el tamaño de la ventana y la pega al borde.
- `preload.js` expone `window.gestionLlamadas` (avisar llamada entrante, contraer/abrir el panel, arrastrar la burbuja, abrir plataforma). En un navegador normal ese objeto no existe y el dashboard funciona igual.
- Permisos: solo micrófono y notificaciones; los enlaces a otros sitios se abren en el navegador.
- Solo Windows (x64). Mac requeriría otro instalador.
