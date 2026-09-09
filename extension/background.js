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

  const ventana = await chrome.windows.create({
    url: `${dashboardUrl}/extension-panel`,
    type: "popup",
    width: ANCHO_VENTANA,
    height: ALTO_VENTANA,
    focused: true,
  });

  await chrome.storage.session.set({ ventanaId: ventana.id });
}

chrome.action.onClicked.addListener(abrirPanel);

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
