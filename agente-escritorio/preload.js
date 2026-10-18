// Puente seguro entre la app de escritorio y las páginas de la plataforma. El dashboard detecta
// `window.gestionLlamadas` para mostrar los controles propios de la app (y ocultar los del navegador).
const { contextBridge, ipcRenderer } = require("electron");

// En la ventana del teléfono, el panel completo no debe verse ni un instante antes de contraerse a burbuja:
// se oculta hasta que la página lo decide (PanelTelefono quita `data-gl-cargando` al montarse).
if (process.argv.includes("--gl-ventana=telefono")) {
  window.addEventListener("DOMContentLoaded", () => {
    if (location.pathname.startsWith("/extension-panel")) {
      document.documentElement.setAttribute("data-gl-cargando", "");
      // Seguro: si la página no llega a montar el teléfono, no se queda en blanco para siempre.
      setTimeout(() => document.documentElement.removeAttribute("data-gl-cargando"), 8000);
    }
  });
}

contextBridge.exposeInMainWorld("gestionLlamadas", {
  esEscritorio: true,
  // true solo en la ventana del teléfono flotante (la que se contrae a burbuja)
  esTelefono: process.argv.includes("--gl-ventana=telefono"),
  llamadaEntrante: (numero) => ipcRenderer.send("llamada-entrante", { numero }),
  mostrarTelefono: () => ipcRenderer.send("mostrar-telefono"),
  ocultarTelefono: () => ipcRenderer.send("ocultar-telefono"),
  abrirPlataforma: () => ipcRenderer.send("abrir-plataforma"),
  // Contraer a burbuja / abrir el panel (la ventana cambia de tamaño y se mantiene pegada al borde)
  fijarExpandido: (expandido) => ipcRenderer.send("telefono:expandido", Boolean(expandido)),
  alAlternarExpandido: (callback) => {
    const escucha = () => callback();
    ipcRenderer.on("alternar-expandido", escucha);
    return () => ipcRenderer.removeListener("alternar-expandido", escucha);
  },
  // Arrastre de la burbuja
  arrastreInicio: () => ipcRenderer.send("arrastre:inicio"),
  arrastreMover: (dx, dy) => ipcRenderer.send("arrastre:mover", { dx, dy }),
  arrastreFin: () => ipcRenderer.send("arrastre:fin"),
  ajustes: {
    obtener: () => ipcRenderer.invoke("ajustes:obtener"),
    guardar: (valores) => ipcRenderer.invoke("ajustes:guardar", valores),
  },
});
