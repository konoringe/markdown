const path = require('node:path');
const { app, BrowserWindow, ipcMain, nativeTheme, shell, Menu } = require('electron');

const RENDERER_HTML = path.join(__dirname, '..', '..', 'dist', 'renderer', 'index.html');

let mainWindow = null;

function openExternal(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl === '') return;
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return;
  }
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
    shell.openExternal(parsed.href).catch(() => {});
  }
}

function createWindow() {
  nativeTheme.themeSource = 'system';
  const dark = nativeTheme.shouldUseDarkColors;

  mainWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 480,
    minHeight: 380,
    show: false,
    frame: false,
    title: 'Markdown',
    backgroundColor: dark ? '#141218' : '#fef7ff',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  Menu.setApplicationMenu(null);

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(RENDERER_HTML);

  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.webContents.send('win:maximized', mainWindow.isMaximized());
    mainWindow.webContents.send('theme:changed', nativeTheme.shouldUseDarkColors);
  });

  mainWindow.on('maximize', () => mainWindow.webContents.send('win:maximized', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('win:maximized', false));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      openExternal(url);
    }
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const withModifier = input.control || input.meta;
    const key = input.key.toLowerCase();
    if (withModifier && input.shift && key === 'i') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
      return;
    }
    if (!app.isPackaged && (input.key === 'F5' || (withModifier && key === 'r'))) {
      mainWindow.webContents.reload();
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.on('theme:get', (event) => {
  event.returnValue = nativeTheme.shouldUseDarkColors;
});

ipcMain.on('win:minimize', () => mainWindow?.minimize());
ipcMain.on('win:close', () => mainWindow?.close());
ipcMain.on('win:toggle-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});

nativeTheme.on('updated', () => {
  mainWindow?.webContents.send('theme:changed', nativeTheme.shouldUseDarkColors);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => app.quit());

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
