/**
 * PlainList Electron preload
 *
 * 通过 contextBridge 暴露一个最小化的 bridge 给渲染进程。
 * 当前 PlainList 前端不需要 node 能力，所以这里只暴露版本信息。
 * 后续要加 IPC（比如读本地文件、调本地工具），在这里加 bridge。
 */
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('plainlistDesktop', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
