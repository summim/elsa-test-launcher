const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  info: () => ipcRenderer.invoke('info'),
  state: () => ipcRenderer.invoke('state'),
  ping: () => ipcRenderer.invoke('ping'),
  notices: () => ipcRenderer.invoke('notices'),
  mods: () => ipcRenderer.invoke('mods'),
  launcherUpdate: () => ipcRenderer.invoke('launcherUpdate'),
  screenshots: () => ipcRenderer.invoke('screenshots'),
  play: () => ipcRenderer.invoke('play'),
  account: () => ipcRenderer.invoke('account'),
  getSettings: () => ipcRenderer.invoke('getSettings'),
  setSettings: (s) => ipcRenderer.invoke('setSettings', s),
  openFolder: (which) => ipcRenderer.invoke('openFolder', which),
  openShot: (name) => ipcRenderer.invoke('openShot', name),
  openExternal: (url) => ipcRenderer.invoke('openExternal', url),
  win: (action) => ipcRenderer.send('win', action),
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onMaximized: (cb) => ipcRenderer.on('maximized', (_e, v) => cb(v)),
});
