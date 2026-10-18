const input = document.getElementById("dashboardUrl");
const esquina = document.getElementById("esquina");
const recordar = document.getElementById("recordarPosicion");
const mensaje = document.getElementById("mensaje");

chrome.storage.sync.get(["dashboardUrl", "esquina", "recordarPosicion"], (cfg) => {
  if (cfg.dashboardUrl) input.value = cfg.dashboardUrl;
  esquina.value = cfg.esquina || "abajo-derecha";
  recordar.checked = cfg.recordarPosicion !== false;
});

document.getElementById("guardar").addEventListener("click", async () => {
  const valor = input.value.trim().replace(/\/+$/, "");
  if (!valor) return;
  await chrome.storage.sync.set({ dashboardUrl: valor, esquina: esquina.value, recordarPosicion: recordar.checked });
  // Si cambió la esquina, se olvida la posición recordada para que se note en la próxima apertura.
  await chrome.storage.local.remove("posicionGuardada");
  mensaje.style.display = "block";
  setTimeout(() => (mensaje.style.display = "none"), 2500);
});
