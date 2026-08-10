/**
 * PlainList Electron preload
 *
 * 通过 contextBridge 暴露一个最小化的 bridge 给渲染进程。
 * FishTime 在桌面端走本机前台应用监测（见 fishtime-local.cjs）。
 */
const { contextBridge } = require('electron');

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
});
