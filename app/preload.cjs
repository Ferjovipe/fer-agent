// The app's window can only ask for this (nothing else from this computer): choosing the brain folder and reopening.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("ferApp", {
  chooseFolder: () => ipcRenderer.invoke("choose-folder"),
  restart: () => ipcRenderer.invoke("restart")
});
