// The app's window can only ask for this (nothing else from this computer): choosing the brain folder and reopening.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("ferApp", {
  elegirCarpeta: () => ipcRenderer.invoke("elegir-carpeta"),
  reiniciar: () => ipcRenderer.invoke("reiniciar")
});
