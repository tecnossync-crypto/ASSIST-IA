# Gestión de Llamadas — app de escritorio (Windows)

App de escritorio para los asesores. No duplica la plataforma: abre **tu mismo dashboard** en dos ventanas, así que cada mejora del dashboard le llega sola.

- **Ventana principal:** el sistema de gestión completo (llamadas, contactos, campañas, configuración según el rol).
- **Teléfono flotante:** ventana pequeña que queda **siempre encima** de todo, en la esquina que se elija. Es la única que registra el teléfono, así que las llamadas no suenan dos veces. Al entrar una llamada, aparece sola encima de todo con una notificación de Windows.
- **Bandeja del sistema** (junto al reloj): cerrar la ventana no desconecta al asesor. Menú con: abrir el sistema, mostrar/ocultar teléfono, esquina, *Abrir con Windows*, ajustes, salir.
- **Atajo global:** `Ctrl + Alt + P` muestra/oculta el teléfono.
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

- El dashboard reconoce la app por la marca `GLDesktop-main` / `GLDesktop-mini` en el User-Agent: la ventana principal no registra el teléfono (ver `dashboard/app/(app)/layout.tsx`).
- `preload.js` expone `window.gestionLlamadas` (avisar llamada entrante, mostrar teléfono, abrir plataforma). En un navegador normal ese objeto no existe y el dashboard funciona igual.
- Permisos: solo micrófono y notificaciones; los enlaces a otros sitios se abren en el navegador.
- Solo Windows (x64). Mac requeriría otro instalador.
