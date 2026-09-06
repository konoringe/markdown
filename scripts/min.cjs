// 最小实验：判断渲染进程与 file:// 加载是否可用
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const LOG = path.join(__dirname, '.min-result.txt');
const log = (line) => fs.appendFileSync(LOG, `${line}\n`);
const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(ROOT, 'dist', 'renderer', 'index.html');

async function main() {
  fs.writeFileSync(LOG, '');
  app.on('window-all-closed', () => {});
  await app.whenReady();
  log('ready');

  const win = new BrowserWindow({ show: false });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => log(`fail: ${code} ${desc} ${url}`));
  win.webContents.on('render-process-gone', (_e, details) => log(`gone: ${JSON.stringify(details)}`));

  const wait = (ms, tag) =>
    Promise.race([
      new Promise((resolve) => win.webContents.once('did-finish-load', () => resolve('loaded'))),
      new Promise((resolve) => setTimeout(() => resolve(tag), ms)),
    ]);

  win.loadURL('data:text/html,<h1>hello</h1>');
  log(`data-url: ${await wait(5000, 'data-timeout')}`);

  win.loadFile(HTML);
  log(`file-url: ${await wait(6000, 'file-timeout')}`);

  app.exit(0);
}

main().catch((error) => {
  log(`FATAL ${error && error.stack}`);
  app.exit(1);
});
