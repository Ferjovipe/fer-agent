// La ventana de la aplicación solo puede pedir esto (nada más de este ordenador): elegir la carpeta del cerebro y volver a abrirse.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("ferApp", {
  elegirCarpeta: () => ipcRenderer.invoke("elegir-carpeta"),
  reiniciar: () => ipcRenderer.invoke("reiniciar")
});
