const input = document.getElementById("dashboardUrl");
const mensaje = document.getElementById("mensaje");

chrome.storage.sync.get("dashboardUrl", ({ dashboardUrl }) => {
  if (dashboardUrl) input.value = dashboardUrl;
});

document.getElementById("guardar").addEventListener("click", async () => {
  const valor = input.value.trim().replace(/\/+$/, "");
  if (!valor) return;
  await chrome.storage.sync.set({ dashboardUrl: valor });
  mensaje.style.display = "block";
  setTimeout(() => (mensaje.style.display = "none"), 2500);
});
