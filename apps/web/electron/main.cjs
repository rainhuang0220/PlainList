/**
 * PlainList Electron 主进程入口
 *
 * 职责：
 *  - 加载 Vite 构建产物的 dist/index.html
 *  - 创建 BrowserWindow，注入 API_BASE_URL（打包时构建产物已写入 __API_BASE_URL__）
 *  - 提供应用生命周期管理（macOS dock 行为、窗口关闭等）
 *
 * 注意：
 *  - 文件用 .cjs 避免 ESM/CJS 互操作问题（package.json 顶层是 type: module）
 *  - 打包后路径用 app.getAppPath() 解析，确保开发态 / 打包态都能用
 */
const { app, BrowserWindow, shell, Menu, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { startFishTimeLocal, DEFAULT_PORT: FISHTIME_PORT } = require('./fishtime-local.cjs');

// Widget sidecars (Focus Bay 等) 走 http:// 公网反代访问。Chromium 把非
// https 的 origin 视为 insecure context，navigator.mediaDevices 会直接
// 不存在，摄像头 (getUserMedia) 无法使用。把 API 域标记为 secure。
// 必须在 app ready 之前调用。端口也要写全——Chromium 按完整 origin 匹配。
app.commandLine.appendSwitch(
  'unsafely-treat-insecure-origin-as-secure',
  [
    'http://175.24.134.228',
    'http://175.24.134.228:80',
    'http://175.24.134.228:3001',
    'http://175.24.134.228:8086',
    'http://127.0.0.1:8800',
    `http://127.0.0.1:${FISHTIME_PORT}`,
  ].join(','),
);

const isDev = !app.isPackaged;
const APP_NAME = 'PlainList';

let mainWindow = null;
/** @type {{ baseUrl: string, stop: () => Promise<void> } | null} */
let fishTimeLocal = null;

function resolveIndexHtml() {
  // 打包后 dist/ 在 Resources/app/dist/
  if (app.isPackaged) {
    return path.join(app.getAppPath(), 'dist', 'index.html');
  }
  // 开发态：从 electron/ 回到 apps/web，再指向 dist
  return path.join(__dirname, '..', 'dist', 'index.html');
}

function resolveAppIcon() {
  // icon.icns 在 build/ 下；找不到时 macOS 会用默认
  const candidates = [
    path.join(__dirname, '..', 'build', 'icon.icns'),
    path.join(__dirname, '..', 'build', 'icon.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function createMainWindow() {
  const iconPath = resolveAppIcon();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    title: APP_NAME,
    backgroundColor: '#F7F7F7',
    ...(iconPath ? { icon: iconPath } : {}),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload 里需要 require node
      webSecurity: true,
    },
  });

  const indexHtml = resolveIndexHtml();
  if (!fs.existsSync(indexHtml)) {
    dialog.showErrorBox(
      APP_NAME,
      `找不到构建产物：${indexHtml}\n请先运行 npm run build (apps/web)。`,
    );
    app.quit();
    return;
  }

  // 显式处理媒体权限：允许摄像头/麦克风（focus-bay 等 widget 需要）。
  // 不设置 handler 时 Electron 的默认行为可能受 iframe/OOPIF 影响，
  // 显式放行 media 权限确保 getUserMedia 不会静默挂起。
  const { session } = require('electron');
  const ses = mainWindow.webContents.session;
  ses.setPermissionRequestHandler((_wc, permission, callback, _details) => {
    const ok =
      permission === 'media' ||
      permission === 'camera' ||
      permission === 'microphone' ||
      permission === 'display-capture' ||
      permission === 'fullscreen' ||
      permission === 'clipboard-sanitized-write';
    callback(ok);
  });
  // Chromium also consults the check handler before showing prompts /
  // enabling mediaDevices; always allow media-family permissions.
  ses.setPermissionCheckHandler((_wc, permission) => {
    return (
      permission === 'media' ||
      permission === 'camera' ||
      permission === 'microphone' ||
      permission === 'display-capture' ||
      permission === 'fullscreen' ||
      permission === 'clipboard-sanitized-write'
    );
  });
  ses.setDevicePermissionHandler((_details) => true);

  mainWindow.loadFile(indexHtml);

  // 应用内页面（file://，如 guide.html）用新窗口打开；外部链接用系统浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('file://')) {
      const child = new BrowserWindow({
        width: 1024,
        height: 780,
        title: APP_NAME,
        parent: mainWindow,
      });
      child.loadURL(url);
      return { action: 'deny' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [{
          label: APP_NAME,
          submenu: [
            { role: 'about', label: `关于 ${APP_NAME}` },
            { type: 'separator' },
            { role: 'services', label: '服务' },
            { type: 'separator' },
            { role: 'hide', label: `隐藏 ${APP_NAME}` },
            { role: 'hideOthers', label: '隐藏其他' },
            { role: 'unhide', label: '全部显示' },
            { type: 'separator' },
            { role: 'quit', label: `退出 ${APP_NAME}` },
          ],
        }]
      : []),
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '切换开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '切换全屏' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        ...(isMac
          ? [
              { type: 'separator' },
              { role: 'front', label: '全部置顶' },
            ]
          : [{ role: 'close', label: '关闭' }]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  // Local FishTime: track frontmost apps on this Mac and serve UI + API.
  try {
    const staticDir = path.join(__dirname, 'fishtime-web');
    fishTimeLocal = await startFishTimeLocal({
      userDataPath: app.getPath('userData'),
      staticDir,
      port: FISHTIME_PORT,
    });
  } catch (e) {
    console.error('[fishtime-local] failed to start:', e);
    fishTimeLocal = null;
  }

  buildMenu();
  createMainWindow();

  app.on('activate', () => {
    // macOS: 点 dock 图标且没有窗口时重开
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('before-quit', () => {
  if (fishTimeLocal) {
    // fire-and-forget flush/stop
    fishTimeLocal.stop().catch(() => {});
    fishTimeLocal = null;
  }
});

app.on('window-all-closed', () => {
  // macOS 通常保持应用活跃，但这里遵循 PlainList 风格，关闭即退出
  if (process.platform !== 'darwin') {
    app.quit();
  } else {
    app.quit();
  }
});

// 阻止主窗口误跳到外部地址；放行 file:// 与本地/云端 widget iframe。
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    const currentUrl = contents.getURL();
    if (url === currentUrl) return;
    if (url.startsWith('file://')) return;
    if (/^https?:\/\/127\.0\.0\.1(?::\d+)?\//i.test(url)) return;
    if (/^https?:\/\/localhost(?::\d+)?\//i.test(url)) return;
    if (/^https?:\/\/175\.24\.134\.228(?::\d+)?\//i.test(url)) return;
    event.preventDefault();
    shell.openExternal(url);
  });
});
