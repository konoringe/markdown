const { contextBridge, ipcRenderer } = require('electron');

let initialDark = false;
try {
  initialDark = ipcRenderer.sendSync('theme:get') === true;
} catch {
  initialDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// preload 早于 document 创建，需等待 DOM 就绪后再写入主题，避免首帧闪白
const applyInitialTheme = () => {
  if (document.documentElement) document.documentElement.dataset.theme = initialDark ? 'dark' : 'light';
};
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyInitialTheme, { once: true });
} else {
  applyInitialTheme();
}

const on = (channel, handler) => {
  const listener = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('md', {
  getTheme: () => initialDark,
  onThemeChange: (handler) => on('theme:changed', handler),
  onMaximizeChange: (handler) => on('win:maximized', handler),
  minimize: () => ipcRenderer.send('win:minimize'),
  toggleMaximize: () => ipcRenderer.send('win:toggle-maximize'),
  close: () => ipcRenderer.send('win:close'),
});
