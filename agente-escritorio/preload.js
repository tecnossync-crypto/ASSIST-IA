// Puente seguro entre la app de escritorio y las páginas de la plataforma. El dashboard detecta
// `window.gestionLlamadas` para mostrar los controles propios de la app (y ocultar los del navegador).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("gestionLlamadas", {
  esEscritorio: true,
  llamadaEntrante: (numero) => ipcRenderer.send("llamada-entrante", { numero }),
  mostrarTelefono: () => ipcRenderer.send("mostrar-telefono"),
  ocultarTelefono: () => ipcRenderer.send("ocultar-telefono"),
  abrirPlataforma: () => ipcRenderer.send("abrir-plataforma"),
  ajustes: {
    obtener: () => ipcRenderer.invoke("ajustes:obtener"),
    guardar: (valores) => ipcRenderer.invoke("ajustes:guardar", valores),
  },
});
