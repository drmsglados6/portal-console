const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('portalConsole', {
  config: () => ipcRenderer.invoke('app:config'),
  diagnostic: (message) => ipcRenderer.send('app:diagnostic', message),
  endingScene: () => ipcRenderer.invoke('ending:scene'),
  endingAudio: () => ipcRenderer.invoke('ending:audio'),
  logoArt: (columns, rows) => ipcRenderer.invoke('app:logo-art', { columns, rows }),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  writeClipboard: (value) => ipcRenderer.invoke('clipboard:write', value),
  create: (options) => ipcRenderer.invoke('terminal:create', options),
  restart: (id) => ipcRenderer.invoke('terminal:restart', { id }),
  write: (id, data) => ipcRenderer.send('terminal:write', { id, data }),
  resize: (id, cols, rows) => ipcRenderer.send('terminal:resize', { id, cols, rows }),
  acknowledge: (id, generation) => ipcRenderer.send('terminal:ack', { id, generation }),
  fullscreen: (value) => ipcRenderer.send('app:fullscreen', value),
  quit: () => ipcRenderer.send('app:quit'),
  newWindow: () => ipcRenderer.invoke('app:new-window'),
  preset: (name) => ipcRenderer.invoke('app:preset', name),
  presets: () => ipcRenderer.invoke('app:preset-list'),
  mediaUrl: (id) => ipcRenderer.invoke('app:media-url', id),
  setLayout: (layout) => ipcRenderer.invoke('app:set-layout', layout),
  close: (id) => ipcRenderer.invoke('terminal:close', id),
  onData: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('terminal:data', listener);
    return () => ipcRenderer.removeListener('terminal:data', listener);
  },
  onExit: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('terminal:exit', listener);
    return () => ipcRenderer.removeListener('terminal:exit', listener);
  }
});
