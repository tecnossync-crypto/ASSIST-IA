// Service worker (Manifest V3): al hacer click en el ícono de la
// extensión, abre el panel de teléfono en una VENTANA de verdad (no el
// popup chiquito que Chrome cierra solo al perder el foco) — así se puede
// mover a otro monitor, dejarla abierta mientras se navega en otras
// pestañas/apps, y sigue viva hasta que el usuario la cierre.
//
// La URL del dashboard se guarda en chrome.storage (ver options.html) en
// vez de venir escrita a mano acá — así funciona para cualquier cliente sin
// tener que editar el código de la extensión, y se puede cambiar si el
// dominio cambia más adelante.

const ANCHO_VENTANA = 380;
const ALTO_VENTANA = 640;
const MARGEN = 16;

// Preferencias (ver options.html): en qué esquina aparece y si recuerda dónde la dejaste.
async function obtenerPreferencias() {
  const { esquina, recordarPosicion } = await chrome.storage.sync.get(["esquina", "recordarPosicion"]);
  return { esquina: esquina || "abajo-derecha", recordarPosicion: recordarPosicion !== false };
}

// Posición de la ventana en la esquina elegida, sobre el área útil del monitor principal (sin barra de tareas).
async function posicionEnEsquina(esquina) {
  try {
    const pantallas = await chrome.system.display.getInfo();
    const p = pantallas.find((d) => d.isPrimary) || pantallas[0];
    const a = p.workArea;
    const izquierda = esquina.endsWith("izquierda");
    const arriba = esquina.startsWith("arriba");
    return {
      left: izquierda ? a.left + MARGEN : a.left + a.width - ANCHO_VENTANA - MARGEN,
      top: arriba ? a.top + MARGEN : a.top + a.height - ALTO_VENTANA - MARGEN,
    };
  } catch {
    return {};
  }
}

async function obtenerUrlDashboard() {
  const { dashboardUrl } = await chrome.storage.sync.get("dashboardUrl");
  return dashboardUrl ? dashboardUrl.replace(/\/+$/, "") : null;
}

async function abrirPanel() {
  const dashboardUrl = await obtenerUrlDashboard();

  if (!dashboardUrl) {
    // Sin configurar todavía — manda a la página de opciones en vez de
    // abrir una ventana rota apuntando a ningún lado.
    chrome.runtime.openOptionsPage();
    return;
  }

  // Si ya hay una ventana del panel abierta, la enfoca en vez de abrir otra
  // — evita que se acumulen ventanas duplicadas a cada click del ícono.
  const { ventanaId } = await chrome.storage.session.get("ventanaId");
  if (ventanaId) {
    try {
      await chrome.windows.update(ventanaId, { focused: true });
      return;
    } catch {
      // La ventana ya no existe (la cerraron) — sigue abajo y abre una nueva.
    }
  }

  const prefs = await obtenerPreferencias();
  const { posicionGuardada } = await chrome.storage.local.get("posicionGuardada");
  const posicion =
    prefs.recordarPosicion && posicionGuardada ? posicionGuardada : await posicionEnEsquina(prefs.esquina);

  const ventana = await chrome.windows.create({
    url: `${dashboardUrl}/extension-panel`,
    type: "popup",
    width: ANCHO_VENTANA,
    height: ALTO_VENTANA,
    focused: true,
    ...posicion,
  });

  await chrome.storage.session.set({ ventanaId: ventana.id });
}

chrome.action.onClicked.addListener(abrirPanel);

// Recuerda dónde dejas la ventana para abrirla ahí la próxima vez (si esa preferencia está activa).
let temporizadorPosicion = null;
chrome.windows.onBoundsChanged.addListener((ventana) => {
  clearTimeout(temporizadorPosicion);
  temporizadorPosicion = setTimeout(async () => {
    const { ventanaId } = await chrome.storage.session.get("ventanaId");
    if (ventana.id !== ventanaId || ventana.state !== "normal") return;
    await chrome.storage.local.set({ posicionGuardada: { left: ventana.left, top: ventana.top } });
  }, 600);
});

chrome.windows.onRemoved.addListener(async (id) => {
  const { ventanaId } = await chrome.storage.session.get("ventanaId");
  if (id === ventanaId) await chrome.storage.session.remove("ventanaId");
});

// Primera instalación: manda directo a configurar la URL, para que el
// ícono ya sirva desde el primer click en vez de fallar en silencio.
chrome.runtime.onInstalled.addListener(async (detalle) => {
  if (detalle.reason === "install") {
    chrome.runtime.openOptionsPage();
  }
});
