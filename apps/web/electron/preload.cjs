/**
 * PlainList Electron preload
 *
 * 通过 contextBridge 暴露一个最小化的 bridge 给渲染进程。
 * FishTime 在桌面端走本机前台应用监测（见 fishtime-local.cjs）。
 */
const { contextBridge, ipcRenderer } = require('electron');

// Keep in sync with fishtime-local.cjs DEFAULT_PORT
const FISHTIME_LOCAL_URL = 'http://127.0.0.1:18765/';

contextBridge.exposeInMainWorld('plainlistDesktop', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  /** When set, marketplace routes the FishTime iframe here instead of cloud WakaTime. */
  fishtimeLocalUrl: FISHTIME_LOCAL_URL,
  api: {
    request: (payload) => ipcRenderer.invoke('desktop-api:request', payload),
  },
  chatgptLocalSync: {
    chooseDirectory: (userScope) => ipcRenderer.invoke('chatgpt-local-sync:choose-directory', userScope),
    status: () => ipcRenderer.invoke('chatgpt-local-sync:status'),
    scan: (userScope, bootstrapWindow) => ipcRenderer.invoke('chatgpt-local-sync:scan', userScope, bootstrapWindow),
    acknowledge: (userScope, completed, summary) => ipcRenderer.invoke('chatgpt-local-sync:acknowledge', userScope, completed, summary),
    setPaused: (paused) => ipcRenderer.invoke('chatgpt-local-sync:set-paused', paused),
    disable: () => ipcRenderer.invoke('chatgpt-local-sync:disable'),
    onChanged: (listener) => { const callback = () => listener(); ipcRenderer.on('chatgpt-local-sync:changed', callback); return () => ipcRenderer.removeListener('chatgpt-local-sync:changed', callback); },
  },
});
