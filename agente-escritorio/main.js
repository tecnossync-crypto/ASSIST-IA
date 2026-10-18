// Gestión de Llamadas — app de escritorio (Windows).
//
// Dos ventanas sobre la MISMA plataforma web (no duplica lógica, así cada mejora del dashboard llega sola):
//   · Ventana principal: el sistema de gestión completo (llamadas, contactos, campañas, configuración…).
//   · Teléfono: una ventana pequeña que queda SIEMPRE encima de las demás, en una esquina. Es la única que
//     registra el teléfono (Twilio), así que no se duplican las llamadas entrantes.
// La app vive en la bandeja del sistema (junto al reloj): cerrar la ventana no desconecta al asesor.

const { app, BrowserWindow, Tray, Menu, screen, shell, ipcMain, session, nativeImage, globalShortcut, Notification } = require("electron");
const path = require("path");
const fs = require("fs");

let autoUpdater = null;
try {
  ({ autoUpdater } = require("electron-updater"));
} catch {
  // sin actualizador (modo desarrollo sin dependencias): la app funciona igual
}

const NOMBRE = "Gestión de Llamadas";
const ANCHO_TELEFONO = 380;
const ALTO_TELEFONO = 640;
const MARGEN = 16;
const ATAJO_TELEFONO = "CommandOrControl+Alt+P";

// ───────────────────────── Configuración (se guarda por usuario de Windows) ─────────────────────────

const archivoConfig = () => path.join(app.getPath("userData"), "config.json");

function cargarConfig() {
  let base = {};
  try {
    base = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
  } catch {
    // sin config de fábrica
  }
  let guardada = {};
  try {
    guardada = JSON.parse(fs.readFileSync(archivoConfig(), "utf8"));
  } catch {
    // primera vez
  }
  return { dashboardUrl: "", abrirConWindows: true, esquina: "abajo-derecha", recordarPosicion: true, ...base, ...guardada };
}

let config = null;

function guardarConfig(parcial) {
  config = { ...config, ...parcial };
  try {
    fs.mkdirSync(path.dirname(archivoConfig()), { recursive: true });
    fs.writeFileSync(archivoConfig(), JSON.stringify(config, null, 2));
  } catch (err) {
    console.error("No se pudo guardar la configuración:", err);
  }
}

function urlBase() {
  return (config.dashboardUrl || "").trim().replace(/\/+$/, "");
}

function origenPermitido() {
  try {
    return new URL(urlBase()).origin;
  } catch {
    return null;
  }
}

// ───────────────────────── Ventanas ─────────────────────────

let ventanaPrincipal = null;
let ventanaTelefono = null;
let ventanaAjustes = null;
let bandeja = null;
let saliendo = false;
let actualizacionLista = false;

const iconoApp = () => path.join(__dirname, "build", "icon.png");

function prepararVentana(win, etiqueta) {
  // El dashboard reconoce la app por esta marca (solo la ventana del teléfono registra el softphone).
  win.webContents.setUserAgent(`${win.webContents.getUserAgent()} GLDesktop-${etiqueta}/${app.getVersion()}`);

  // Los enlaces a otros sitios se abren en el navegador, no dentro de la app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) {
      if (new URL(url).origin === origenPermitido()) win.loadURL(url);
      else shell.openExternal(url);
    }
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (url.startsWith("file:")) return;
    try {
      if (new URL(url).origin !== origenPermitido()) {
        e.preventDefault();
        if (/^https?:/i.test(url)) shell.openExternal(url);
      }
    } catch {
      e.preventDefault();
    }
  });
  win.webContents.on("did-fail-load", (_e, codigo, descripcion, url, esPrincipal) => {
    if (!esPrincipal || codigo === -3) return;
    mostrarErrorConexion(win, descripcion);
  });
}

function mostrarErrorConexion(win, descripcion) {
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{font-family:Segoe UI,system-ui,sans-serif;background:#f8fafc;color:#1e293b;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
    .c{max-width:300px;padding:24px}h1{font-size:16px;margin:0 0 8px}p{font-size:13px;color:#64748b;line-height:1.5}
    button{margin-top:14px;padding:8px 16px;border:0;border-radius:8px;background:#4f46e5;color:#fff;font-size:13px;cursor:pointer}
  </style><div class="c"><h1>No se pudo conectar</h1><p>Revisa tu conexión a internet. ${descripcion ? "(" + descripcion + ")" : ""}</p>
  <button onclick="location.href='${urlBase()}'">Reintentar</button></div>`;
  win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
}

function crearVentanaPrincipal() {
  ventanaPrincipal = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: NOMBRE,
    icon: iconoApp(),
    autoHideMenuBar: true,
    backgroundColor: "#f8fafc",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  prepararVentana(ventanaPrincipal, "main");
  ventanaPrincipal.loadURL(`${urlBase()}/`);
  ventanaPrincipal.once("ready-to-show", () => {
    if (!iniciadaOculta()) ventanaPrincipal.show();
  });
  // Cerrar = esconder en la bandeja: el teléfono sigue conectado para recibir llamadas.
  ventanaPrincipal.on("close", (e) => {
    if (!saliendo) {
      e.preventDefault();
      ventanaPrincipal.hide();
    }
  });
}

function iniciadaOculta() {
  return process.argv.includes("--oculta");
}

function posicionEnEsquina() {
  const a = screen.getPrimaryDisplay().workArea;
  const izquierda = config.esquina.endsWith("izquierda");
  const arriba = config.esquina.startsWith("arriba");
  return {
    x: izquierda ? a.x + MARGEN : a.x + a.width - ANCHO_TELEFONO - MARGEN,
    y: arriba ? a.y + MARGEN : a.y + a.height - ALTO_TELEFONO - MARGEN,
  };
}

// La posición recordada solo vale si sigue dentro de alguna pantalla (por si quitaron un monitor).
function posicionRecordadaValida() {
  const p = config.posicionTelefono;
  if (!config.recordarPosicion || !p) return null;
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return p.x >= a.x - 40 && p.y >= a.y - 40 && p.x < a.x + a.width - 100 && p.y < a.y + a.height - 100;
  });
  return visible ? p : null;
}

function crearVentanaTelefono() {
  const pos = posicionRecordadaValida() ?? posicionEnEsquina();
  ventanaTelefono = new BrowserWindow({
    width: ANCHO_TELEFONO,
    height: ALTO_TELEFONO,
    x: pos.x,
    y: pos.y,
    minWidth: 320,
    minHeight: 420,
    show: false,
    title: "Teléfono",
    icon: iconoApp(),
    autoHideMenuBar: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    maximizable: false,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // La ventana puede estar oculta y debe seguir recibiendo llamadas.
      backgroundThrottling: false,
    },
  });
  // "screen-saver" la mantiene incluso sobre programas a pantalla completa y sobre la barra de tareas.
  ventanaTelefono.setAlwaysOnTop(true, "screen-saver");
  prepararVentana(ventanaTelefono, "mini");
  ventanaTelefono.loadURL(`${urlBase()}/extension-panel`);

  let t = null;
  ventanaTelefono.on("moved", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      if (ventanaTelefono && !ventanaTelefono.isDestroyed()) {
        const [x, y] = ventanaTelefono.getPosition();
        guardarConfig({ posicionTelefono: { x, y } });
      }
    }, 500);
  });
  ventanaTelefono.on("close", (e) => {
    if (!saliendo) {
      e.preventDefault();
      ventanaTelefono.hide();
    }
  });
  ventanaTelefono.on("show", actualizarMenuBandeja);
  ventanaTelefono.on("hide", actualizarMenuBandeja);
}

function mostrarTelefono({ sinRobarFoco = false } = {}) {
  if (!ventanaTelefono || ventanaTelefono.isDestroyed()) crearVentanaTelefono();
  if (ventanaTelefono.isMinimized()) ventanaTelefono.restore();
  if (sinRobarFoco) ventanaTelefono.showInactive();
  else ventanaTelefono.show();
  ventanaTelefono.setAlwaysOnTop(true, "screen-saver");
  ventanaTelefono.moveTop();
}

function alternarTelefono() {
  if (ventanaTelefono && ventanaTelefono.isVisible()) ventanaTelefono.hide();
  else mostrarTelefono();
}

function mostrarPrincipal() {
  if (!ventanaPrincipal || ventanaPrincipal.isDestroyed()) crearVentanaPrincipal();
  if (ventanaPrincipal.isMinimized()) ventanaPrincipal.restore();
  ventanaPrincipal.show();
  ventanaPrincipal.focus();
}

function abrirAjustes() {
  if (ventanaAjustes && !ventanaAjustes.isDestroyed()) {
    ventanaAjustes.focus();
    return;
  }
  ventanaAjustes = new BrowserWindow({
    width: 440,
    height: 470,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: `Ajustes — ${NOMBRE}`,
    icon: iconoApp(),
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  ventanaAjustes.loadFile(path.join(__dirname, "ajustes.html"));
  ventanaAjustes.on("closed", () => (ventanaAjustes = null));
}

// ───────────────────────── Bandeja del sistema ─────────────────────────

function actualizarMenuBandeja() {
  if (!bandeja) return;
  const telefonoVisible = Boolean(ventanaTelefono && !ventanaTelefono.isDestroyed() && ventanaTelefono.isVisible());
  const menu = Menu.buildFromTemplate([
    { label: "Abrir el sistema de gestión", click: mostrarPrincipal },
    { label: telefonoVisible ? "Ocultar el teléfono" : "Mostrar el teléfono", accelerator: ATAJO_TELEFONO, click: alternarTelefono },
    { type: "separator" },
    {
      label: "Esquina del teléfono",
      submenu: [
        ["abajo-derecha", "Abajo a la derecha"],
        ["abajo-izquierda", "Abajo a la izquierda"],
        ["arriba-derecha", "Arriba a la derecha"],
        ["arriba-izquierda", "Arriba a la izquierda"],
      ].map(([valor, etiqueta]) => ({
        label: etiqueta,
        type: "radio",
        checked: config.esquina === valor,
        click: () => {
          guardarConfig({ esquina: valor, posicionTelefono: null });
          if (ventanaTelefono && !ventanaTelefono.isDestroyed()) {
            const p = posicionEnEsquina();
            ventanaTelefono.setPosition(p.x, p.y);
          }
          actualizarMenuBandeja();
        },
      })),
    },
    {
      label: "Abrir con Windows",
      type: "checkbox",
      checked: config.abrirConWindows,
      click: (item) => aplicarAbrirConWindows(item.checked),
    },
    { label: "Ajustes…", click: abrirAjustes },
    ...(actualizacionLista
      ? [{ type: "separator" }, { label: "Reiniciar para actualizar", click: () => { saliendo = true; autoUpdater.quitAndInstall(); } }]
      : []),
    { type: "separator" },
    {
      label: "Salir",
      click: () => {
        saliendo = true;
        app.quit();
      },
    },
  ]);
  bandeja.setContextMenu(menu);
}

function crearBandeja() {
  const icono = nativeImage.createFromPath(path.join(__dirname, "build", "tray.png"));
  bandeja = new Tray(icono);
  bandeja.setToolTip(NOMBRE);
  bandeja.on("click", alternarTelefono);
  bandeja.on("double-click", mostrarPrincipal);
  actualizarMenuBandeja();
}

function aplicarAbrirConWindows(activo) {
  guardarConfig({ abrirConWindows: activo });
  // Solo tiene sentido en la app instalada, no al probarla con "npm start".
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: activo, args: ["--oculta"] });
  }
  actualizarMenuBandeja();
}

// ───────────────────────── Comunicación con las páginas ─────────────────────────

ipcMain.on("llamada-entrante", (_e, datos) => {
  // Suena una llamada: el teléfono se muestra encima de todo (sin quitarle el foco a lo que se esté escribiendo).
  mostrarTelefono({ sinRobarFoco: true });
  ventanaTelefono.flashFrame(true);
  setTimeout(() => ventanaTelefono && !ventanaTelefono.isDestroyed() && ventanaTelefono.flashFrame(false), 6000);
  if (Notification.isSupported()) {
    const n = new Notification({ title: "Llamada entrante", body: datos?.numero ? String(datos.numero) : NOMBRE, icon: iconoApp() });
    n.on("click", () => mostrarTelefono());
    n.show();
  }
});
ipcMain.on("mostrar-telefono", () => mostrarTelefono());
ipcMain.on("ocultar-telefono", () => ventanaTelefono && ventanaTelefono.hide());
ipcMain.on("abrir-plataforma", () => mostrarPrincipal());
ipcMain.handle("ajustes:obtener", () => ({
  dashboardUrl: config.dashboardUrl,
  abrirConWindows: config.abrirConWindows,
  esquina: config.esquina,
  recordarPosicion: config.recordarPosicion,
  version: app.getVersion(),
}));
ipcMain.handle("ajustes:guardar", (_e, nuevos) => {
  const url = String(nuevos?.dashboardUrl || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\/.+/i.test(url)) return { error: "Escribe la dirección completa, por ejemplo https://dashboard.tu-empresa.com" };
  const cambioUrl = url !== urlBase();
  guardarConfig({
    dashboardUrl: url,
    esquina: nuevos.esquina,
    recordarPosicion: Boolean(nuevos.recordarPosicion),
    posicionTelefono: null,
  });
  aplicarAbrirConWindows(Boolean(nuevos.abrirConWindows));
  if (cambioUrl) {
    ventanaPrincipal && !ventanaPrincipal.isDestroyed() && ventanaPrincipal.loadURL(`${url}/`);
    ventanaTelefono && !ventanaTelefono.isDestroyed() && ventanaTelefono.loadURL(`${url}/extension-panel`);
    configurarActualizador();
  }
  if (ventanaTelefono && !ventanaTelefono.isDestroyed()) {
    const p = posicionEnEsquina();
    ventanaTelefono.setPosition(p.x, p.y);
  }
  actualizarMenuBandeja();
  return { ok: true };
});

// ───────────────────────── Actualizaciones ─────────────────────────

function configurarActualizador() {
  if (!autoUpdater || !app.isPackaged || !urlBase()) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.setFeedURL({ provider: "generic", url: `${urlBase()}/descargas/` });
}

function buscarActualizaciones() {
  if (!autoUpdater || !app.isPackaged) return;
  autoUpdater.checkForUpdates().catch(() => {
    // sin conexión o aún no hay versión publicada: se reintenta más tarde
  });
}

// ───────────────────────── Arranque ─────────────────────────

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => mostrarPrincipal());

  app.whenReady().then(() => {
    config = cargarConfig();
    Menu.setApplicationMenu(null);
    app.setAppUserModelId("com.tecnossync.gestionllamadas");

    // El teléfono necesita micrófono y avisos del sistema; nada más.
    session.defaultSession.setPermissionRequestHandler((_wc, permiso, callback) => {
      callback(["media", "audioCapture", "notifications"].includes(permiso));
    });
    session.defaultSession.setPermissionCheckHandler((_wc, permiso) => ["media", "audioCapture", "notifications"].includes(permiso));

    crearBandeja();
    if (!urlBase()) {
      abrirAjustes();
    } else {
      crearVentanaPrincipal();
      crearVentanaTelefono();
      // Al arrancar con Windows queda solo el teléfono; abierta a mano, se ve el sistema de gestión.
      if (iniciadaOculta()) mostrarTelefono({ sinRobarFoco: true });
    }

    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: config.abrirConWindows, args: ["--oculta"] });
    globalShortcut.register(ATAJO_TELEFONO, alternarTelefono);

    if (autoUpdater) {
      configurarActualizador();
      autoUpdater.on("update-downloaded", () => {
        actualizacionLista = true;
        actualizarMenuBandeja();
        if (Notification.isSupported()) {
          new Notification({
            title: NOMBRE,
            body: "Hay una versión nueva lista. Se instalará al cerrar la app, o elige 'Reiniciar para actualizar' en la bandeja.",
            icon: iconoApp(),
          }).show();
        }
      });
      autoUpdater.on("error", () => {});
      setTimeout(buscarActualizaciones, 15_000);
      setInterval(buscarActualizaciones, 4 * 60 * 60 * 1000);
    }
  });

  app.on("before-quit", () => {
    saliendo = true;
  });
  app.on("will-quit", () => globalShortcut.unregisterAll());
  // No se cierra al cerrar las ventanas: vive en la bandeja.
  app.on("window-all-closed", () => {});
}
