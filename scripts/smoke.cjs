// 临时冒烟脚本：以隐藏窗口加载渲染层，验证渲染、切换、主题与样式生效
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');

const RESULT_FILE = path.join(__dirname, '.smoke-result.json');
const log = (chunk) => fs.appendFileSync(RESULT_FILE, `${chunk}\n`);

const ARGV = process.argv.slice(2);
const USE_SANDBOX = !ARGV.includes('--no-sandbox');
const USE_ENGLISH_PATH = ARGV.includes('--english');

const ROOT = path.resolve(__dirname, '..');

let HTML = path.join(ROOT, 'dist', 'renderer', 'index.html');
let PRELOAD = path.join(ROOT, 'src', 'main', 'preload.js');

if (USE_ENGLISH_PATH) {
  const dir = 'C:\\md3md-smoke';
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.cpSync(path.join(ROOT, 'dist', 'renderer'), path.join(dir, 'renderer'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'src', 'main', 'preload.js'), path.join(dir, 'preload.js'));
  HTML = path.join(dir, 'renderer', 'index.html');
  PRELOAD = path.join(dir, 'preload.js');
}

const SAMPLE = [
  '# 一级标题',
  '',
  '正文 **粗体**、*斜体*、`行内代码` 与 [链接](https://example.com)。',
  '',
  '```js',
  'const total = 42;',
  'function greet(name) { return `hi ${name}`; }',
  '```',
  '',
  '- 列表项一',
  '- 列表项二',
  '',
  '> 引用文本',
  '',
  '| 列 A | 列 B |',
  '| --- | --- |',
  '| 1 | 2 |',
  '',
  '<img src="https://invalid.invalid/x.png" alt="坏图" />',
  '<script>window.__pwned = true;<\/script>',
  '[xss](javascript:alert(1))',
].join('\n');

// 模拟真实主进程提供的 IPC 契约
ipcMain.on('theme:get', (event) => {
  event.returnValue = nativeTheme.shouldUseDarkColors;
});
ipcMain.on('win:minimize', () => {});
ipcMain.on('win:toggle-maximize', () => {});
ipcMain.on('win:close', () => {});

async function main() {
  fs.writeFileSync(RESULT_FILE, '');
  log('smoke: start');
  app.on('window-all-closed', () => {});
  await app.whenReady();
  log('smoke: ready');
  const win = new BrowserWindow({
    show: true,
    width: 1000,
    height: 720,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: USE_SANDBOX,
    },
  });

  const errors = [];
  win.webContents.on('console-message', (event, level, message) => {
    if (level >= 2) errors.push(message);
  });

  win.webContents.on('did-fail-load', (_e, code, desc, url) => log(`did-fail-load ${code} ${desc} ${url}`));
  win.webContents.on('render-process-gone', (_e, details) => log(`render-process-gone ${JSON.stringify(details)}`));
  win.webContents.on('preload-error', (_e, preloadPath, error) => log(`preload-error ${preloadPath} ${error.message}`));

  const withTimeout = (promise, ms, tag) =>
    Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(tag), ms))]);

  log(`html exists: ${fs.existsSync(HTML)}`);
  log(`config: sandbox=${USE_SANDBOX} english=${USE_ENGLISH_PATH} html=${HTML}`);

  win.loadFile(HTML).catch((error) => log(`loadFile error: ${error && error.message}`));
  log('smoke: loadFile issued');
  const loaded = await withTimeout(
    new Promise((resolve) => win.webContents.once('did-finish-load', () => resolve('loaded'))),
    6000,
    'timeout',
  );
  log(`smoke: did-finish-load = ${loaded}`);
  if (loaded !== 'loaded') {
    log(`smoke: abort, url=${win.webContents.getURL()}`);
    app.exit(2);
    return;
  }

  let result;
  try {
    result = await win.webContents.executeJavaScript(
    `(async () => {
      const editor = document.getElementById('editor');
      const preview = document.getElementById('preview');
      const stageInner = document.getElementById('stageInner');
      const fab = document.getElementById('fab');

      editor.value = ${JSON.stringify(SAMPLE)};
      editor.dispatchEvent(new Event('input'));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      const beforeToggle = {
        h1: !!preview.querySelector('h1'),
        strong: !!preview.querySelector('strong'),
        inlineCode: !!preview.querySelector('p code'),
        codeBlock: !!preview.querySelector('pre.md-code code.hljs'),
        highlightToken: !!preview.querySelector('.hljs-keyword'),
        listItems: preview.querySelectorAll('li').length,
        quote: !!preview.querySelector('blockquote'),
        table: !!preview.querySelector('table'),
        linkTarget: preview.querySelector('a')?.getAttribute('target') ?? null,
        scriptStripped: !preview.querySelector('script') && window.__pwned === undefined,
        jsHrefNeutralized: !preview.querySelector('a[href^="javascript"]'),
      };

      fab.click();
      await new Promise((r) => setTimeout(r, 900));

      const afterToggle = {
        mode: document.body.dataset.mode,
        revealing: stageInner.classList.contains('is-revealing'),
        previewVisibility: getComputedStyle(preview).visibility,
        editorVisibility: getComputedStyle(editor).visibility,
        fabBackground: getComputedStyle(fab).backgroundColor,
        brokenImageHidden: Array.from(preview.querySelectorAll('img')).every((img) => img.style.display === 'none'),
        apiAvailable: typeof window.md,
        theme: document.documentElement.dataset.theme,
        supportsViewTransition: typeof document.startViewTransition === 'function',
      };

      // 再切回编辑态
      fab.click();
      await new Promise((r) => setTimeout(r, 900));
      const backToEdit = {
        mode: document.body.dataset.mode,
        editorVisibility: getComputedStyle(editor).visibility,
        previewVisibility: getComputedStyle(preview).visibility,
      };

      return { beforeToggle, afterToggle, backToEdit };
    })()`,
    );
  } catch (error) {
    log(`EXEC_ERROR: ${error && error.stack ? error.stack : error}`);
  }

  log(`RESULT ${JSON.stringify(result, null, 2)}`);
  if (errors.length) log(`CONSOLE_ERRORS: ${JSON.stringify(errors)}`);
  log('smoke: done');
  app.exit(0);
}

main().catch((error) => {
  log(`FATAL: ${error && error.stack ? error.stack : error}`);
  app.exit(1);
});
