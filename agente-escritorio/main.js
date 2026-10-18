// Gestión de Llamadas — app de escritorio (Windows).
//
// Dos ventanas sobre la MISMA plataforma web (no duplica lógica, así cada mejora del dashboard llega sola):
//   · Ventana principal: el sistema de gestión completo (llamadas, contactos, campañas, configuración…).
//   · Teléfono: un widget pegado al borde de la pantalla (izquierda por defecto), siempre encima de las demás
//     ventanas. Está CONTRAÍDO como una burbuja pequeña; un clic lo abre (marcar, contactos, recientes,
//     llamadas entrantes…) y otro lo vuelve a contraer. Se arrastra y se pega solo al borde más cercano.
//     Es la única ventana que registra el teléfono (Twilio), así que no se duplican las llamadas entrantes.
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
const BURBUJA = 72; // ventana de la burbuja (el círculo mide 56; el resto es margen para la insignia)
const ANCHO_EXPANDIDO = 380;
const ALTO_EXPANDIDO = 640;
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
  return { dashboardUrl: "", abrirConWindows: true, lado: "izquierda", yBurbuja: null, ...base, ...guardada };
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
let telefonoExpandido = false;
let origenArrastre = null;

const iconoApp = () => path.join(__dirname, "build", "icon.png");

function webPreferences(extra = {}) {
  return {
    preload: path.join(__dirname, "preload.js"),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    ...extra,
  };
}

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
  win.webContents.on("did-fail-load", (_e, codigo, descripcion, _url, esPrincipal) => {
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

function iniciadaOculta() {
  return process.argv.includes("--oculta");
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
    webPreferences: webPreferences({ backgroundThrottling: false, additionalArguments: ["--gl-ventana=principal"] }),
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

// ── Geometría del widget del teléfono ──

function pantallaDe(rect) {
  return screen.getDisplayMatching(rect);
}

function limitar(valor, min, max) {
  return Math.max(min, Math.min(valor, Math.max(min, max)));
}

/** Rectángulo de la burbuja pegada al borde (izquierda/derecha) de la pantalla, a la altura `y`. */
function rectBurbuja(display, lado, y) {
  const a = display.workArea;
  return {
    x: lado === "izquierda" ? a.x : a.x + a.width - BURBUJA,
    y: limitar(Math.round(y), a.y, a.y + a.height - BURBUJA),
    width: BURBUJA,
    height: BURBUJA,
  };
}

/** Rectángulo del panel abierto, pegado al mismo borde que la burbuja. */
function rectExpandido(display, lado, y) {
  const a = display.workArea;
  const alto = Math.min(ALTO_EXPANDIDO, a.height);
  return {
    x: lado === "izquierda" ? a.x : a.x + a.width - ANCHO_EXPANDIDO,
    y: limitar(Math.round(y), a.y, a.y + a.height - alto),
    width: ANCHO_EXPANDIDO,
    height: alto,
  };
}

function rectInicialBurbuja() {
  const display = screen.getPrimaryDisplay();
  const y = config.yBurbuja ?? display.workArea.y + display.workArea.height * 0.35;
  return rectBurbuja(display, config.lado, y);
}

/** Pasa el widget a burbuja o a panel abierto, manteniéndolo pegado al borde de la pantalla. */
function aplicarTamanoTelefono(expandido) {
  if (!ventanaTelefono || ventanaTelefono.isDestroyed()) return;
  const actual = ventanaTelefono.getBounds();
  const display = pantallaDe(actual);

  if (expandido) {
    ventanaTelefono.setBounds(rectExpandido(display, config.lado, actual.y));
  } else if (telefonoExpandido) {
    // Al contraer: la burbuja se pega al borde más cercano a donde se haya dejado el panel.
    const centro = actual.x + actual.width / 2;
    const lado = centro < display.workArea.x + display.workArea.width / 2 ? "izquierda" : "derecha";
    const r = rectBurbuja(display, lado, actual.y);
    guardarConfig({ lado, yBurbuja: r.y });
    ventanaTelefono.setBounds(r);
    actualizarMenuBandeja();
  } else {
    ventanaTelefono.setBounds(rectBurbuja(display, config.lado, actual.y));
  }
  telefonoExpandido = expandido;
}

function crearVentanaTelefono() {
  const r = rectInicialBurbuja();
  telefonoExpandido = false;
  ventanaTelefono = new BrowserWindow({
    ...r,
    show: false,
    title: "Teléfono",
    icon: iconoApp(),
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: "#00000000",
    // La ventana puede estar contraída u oculta y debe seguir recibiendo llamadas.
    webPreferences: webPreferences({ backgroundThrottling: false, additionalArguments: ["--gl-ventana=telefono"] }),
  });
  // "screen-saver" la mantiene incluso sobre programas a pantalla completa y sobre la barra de tareas.
  ventanaTelefono.setAlwaysOnTop(true, "screen-saver");
  prepararVentana(ventanaTelefono, "mini");
  ventanaTelefono.loadURL(`${urlBase()}/extension-panel`);

  // Si hay que iniciar sesión, la pantalla de login necesita espacio: se abre el panel completo.
  ventanaTelefono.webContents.on("did-navigate", (_e, url) => {
    try {
      if (new URL(url).pathname.startsWith("/login")) aplicarTamanoTelefono(true);
    } catch {
      // url rara: nada
    }
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
  if (sinRobarFoco) ventanaTelefono.showInactive();
  else ventanaTelefono.show();
  ventanaTelefono.setAlwaysOnTop(true, "screen-saver");
  ventanaTelefono.moveTop();
}

/** Atajo / clic en la bandeja: si está oculto lo muestra; si no, abre o contrae el panel. */
function alternarTelefono() {
  if (!ventanaTelefono || ventanaTelefono.isDestroyed() || !ventanaTelefono.isVisible()) {
    mostrarTelefono();
    return;
  }
  ventanaTelefono.webContents.send("alternar-expandido");
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
    height: 430,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: `Ajustes — ${NOMBRE}`,
    icon: iconoApp(),
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    webPreferences: webPreferences({ additionalArguments: ["--gl-ventana=ajustes"] }),
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
    {
      label: telefonoVisible ? "Ocultar el teléfono" : "Mostrar el teléfono",
      click: () => {
        if (telefonoVisible) ventanaTelefono.hide();
        else mostrarTelefono();
      },
    },
    { type: "separator" },
    {
      label: "Lado de la pantalla",
      submenu: [
        ["izquierda", "Izquierda"],
        ["derecha", "Derecha"],
      ].map(([valor, etiqueta]) => ({
        label: etiqueta,
        type: "radio",
        checked: config.lado === valor,
        click: () => {
          guardarConfig({ lado: valor });
          if (ventanaTelefono && !ventanaTelefono.isDestroyed()) {
            const actual = ventanaTelefono.getBounds();
            const display = pantallaDe(actual);
            ventanaTelefono.setBounds(
              telefonoExpandido ? rectExpandido(display, valor, actual.y) : rectBurbuja(display, valor, actual.y)
            );
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
      ? [
          { type: "separator" },
          {
            label: "Reiniciar para actualizar",
            click: () => {
              saliendo = true;
              autoUpdater.quitAndInstall();
            },
          },
        ]
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
  bandeja.setToolTip(`${NOMBRE} — clic: teléfono (${ATAJO_TELEFONO.replace("CommandOrControl", "Ctrl")})`);
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
  // La propia página lo abre en grande al detectar la llamada.
  mostrarTelefono({ sinRobarFoco: true });
  if (Notification.isSupported()) {
    const n = new Notification({ title: "Llamada entrante", body: datos?.numero ? String(datos.numero) : NOMBRE, icon: iconoApp() });
    n.on("click", () => mostrarTelefono());
    n.show();
  }
});
ipcMain.on("mostrar-telefono", () => mostrarTelefono());
ipcMain.on("ocultar-telefono", () => ventanaTelefono && ventanaTelefono.hide());
ipcMain.on("abrir-plataforma", () => mostrarPrincipal());
ipcMain.on("telefono:expandido", (_e, expandido) => aplicarTamanoTelefono(Boolean(expandido)));

// Arrastre de la burbuja (la burbuja es clicable, así que no puede usar la zona de arrastre del sistema).
ipcMain.on("arrastre:inicio", () => {
  if (ventanaTelefono && !ventanaTelefono.isDestroyed()) origenArrastre = ventanaTelefono.getBounds();
});
ipcMain.on("arrastre:mover", (_e, { dx, dy }) => {
  if (!ventanaTelefono || ventanaTelefono.isDestroyed() || !origenArrastre) return;
  ventanaTelefono.setBounds({
    x: Math.round(origenArrastre.x + dx),
    y: Math.round(origenArrastre.y + dy),
    width: origenArrastre.width,
    height: origenArrastre.height,
  });
});
ipcMain.on("arrastre:fin", () => {
  if (!ventanaTelefono || ventanaTelefono.isDestroyed()) return;
  origenArrastre = null;
  const actual = ventanaTelefono.getBounds();
  const display = pantallaDe(actual);
  const centro = actual.x + actual.width / 2;
  const lado = centro < display.workArea.x + display.workArea.width / 2 ? "izquierda" : "derecha";
  const r = rectBurbuja(display, lado, actual.y);
  guardarConfig({ lado, yBurbuja: r.y });
  ventanaTelefono.setBounds(r); // se pega al borde más cercano
  actualizarMenuBandeja();
});

ipcMain.handle("ajustes:obtener", () => ({
  dashboardUrl: config.dashboardUrl,
  abrirConWindows: config.abrirConWindows,
  lado: config.lado,
  version: app.getVersion(),
}));
ipcMain.handle("ajustes:guardar", (_e, nuevos) => {
  const url = String(nuevos?.dashboardUrl || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\/.+/i.test(url)) return { error: "Escribe la dirección completa, por ejemplo https://dashboard.tu-empresa.com" };
  const cambioUrl = url !== urlBase();
  guardarConfig({ dashboardUrl: url, lado: nuevos.lado === "derecha" ? "derecha" : "izquierda" });
  aplicarAbrirConWindows(Boolean(nuevos.abrirConWindows));
  if (cambioUrl) {
    ventanaPrincipal && !ventanaPrincipal.isDestroyed() && ventanaPrincipal.loadURL(`${url}/`);
    ventanaTelefono && !ventanaTelefono.isDestroyed() && ventanaTelefono.loadURL(`${url}/extension-panel`);
    configurarActualizador();
  }
  if (ventanaTelefono && !ventanaTelefono.isDestroyed()) {
    const actual = ventanaTelefono.getBounds();
    const display = pantallaDe(actual);
    ventanaTelefono.setBounds(
      telefonoExpandido ? rectExpandido(display, config.lado, actual.y) : rectBurbuja(display, config.lado, actual.y)
    );
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
      // La burbuja siempre queda a la vista; el sistema de gestión solo si no se arrancó con Windows.
      ventanaTelefono.once("ready-to-show", () => mostrarTelefono({ sinRobarFoco: true }));
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
