import './styles/tokens.css';
import './styles/base.css';
import './styles/motion.css';
import './styles/markdown.css';
import './styles/fab.css';

import { renderMarkdown } from './markdown.js';
import {
  createPress,
  morphIcons,
  nextFrame,
  primeReveal,
  revealLayers,
  runThemeTransition,
  spawnRipple,
} from './motion.js';

const LARGE_DOCUMENT = 100000;
const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escapeText = (value) => String(value).replace(/[&<>"]/g, (char) => ESCAPE_MAP[char]);

const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const stageInner = document.getElementById('stageInner');
const fab = document.getElementById('fab');
const titlebar = document.getElementById('titlebar');
const iconPreview = fab.querySelector('.fab__icon--preview');
const iconEdit = fab.querySelector('.fab__icon--edit');
const api = window.md;

/* ---------------- 实时渲染（rAF 合并 + 大文档自适应降频） ---------------- */

let pendingRender = false;
let renderCooldown = 0;
let lastSource = null;

function hideBrokenImages() {
  for (const img of preview.querySelectorAll('img')) {
    img.addEventListener(
      'error',
      () => {
        img.style.display = 'none';
      },
      { once: true },
    );
  }
}

function flushRender() {
  const source = editor.value;
  if (source === lastSource) return;
  lastSource = source;
  const started = performance.now();
  try {
    preview.innerHTML = renderMarkdown(source);
    hideBrokenImages();
  } catch (error) {
    preview.innerHTML = `<div class="md-error">渲染失败：${escapeText(error?.message ?? error)}</div>`;
  }
  const cost = performance.now() - started;
  renderCooldown = cost > 12 ? Math.min(180, Math.round(cost * 4)) : 0;
}

function scheduleRender() {
  if (pendingRender) return;
  pendingRender = true;
  const run = () =>
    requestAnimationFrame(() => {
      pendingRender = false;
      flushRender();
    });
  if (renderCooldown > 0) setTimeout(run, renderCooldown);
  else run();
}

editor.addEventListener('input', scheduleRender);

/* ---------------- 视图切换（流体圆形揭示） ---------------- */

let mode = 'edit';
let busy = false;
let queued = null;

const scrollRatio = (el) => {
  const max = el.scrollHeight - el.clientHeight;
  return max > 0 ? el.scrollTop / max : 0;
};

const applyScrollRatio = (el, ratio) => {
  const max = el.scrollHeight - el.clientHeight;
  el.scrollTop = max > 0 ? ratio * max : 0;
};

function originFromPoint(x, y) {
  const rect = stageInner.getBoundingClientRect();
  return { x: x - rect.left, y: y - rect.top };
}

function fabOrigin() {
  const rect = fab.getBoundingClientRect();
  return originFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

function requestToggle(origin) {
  if (busy) {
    const target = mode === 'edit' ? 'preview' : 'edit';
    queued = queued === target ? null : target;
    return;
  }
  void toggleView(origin);
}

async function toggleView(origin) {
  const next = mode === 'edit' ? 'preview' : 'edit';
  const outgoing = mode === 'edit' ? editor : preview;
  const incoming = next === 'edit' ? editor : preview;

  if (next === 'preview') flushRender();

  const ratio = scrollRatio(outgoing);
  busy = true;
  stageInner.classList.add('is-revealing');
  incoming.classList.add('layer--top');
  document.body.dataset.mode = next;
  mode = next;
  applyScrollRatio(incoming, ratio);
  fab.setAttribute('aria-label', next === 'preview' ? '切换到原文视图' : '切换到渲染视图');
  void morphIcons(next === 'preview' ? iconEdit : iconPreview, next === 'preview' ? iconPreview : iconEdit);

  // 预置：涟漪开始前让新层整体不可见（避免先闪出新视图再切回旧文本的叠影）
  primeReveal(incoming, origin);

  await nextFrame();
  await revealLayers({
    container: stageInner,
    incoming,
    outgoing,
    origin,
    simplify: editor.value.length > LARGE_DOCUMENT,
  });

  stageInner.classList.remove('is-revealing');
  incoming.classList.remove('layer--top');
  applyScrollRatio(incoming, ratio);

  if (next === 'edit') editor.focus({ preventScroll: true });

  busy = false;

  if (queued && queued !== mode) {
    queued = null;
    void toggleView(fabOrigin());
  } else {
    queued = null;
  }
}

/* ---------------- FAB 按压、涟漪与点击 ---------------- */

const press = createPress(fab);
let activeRipple = null;
let upInside = true;
let keyboardActivation = false;

fab.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  fab.setPointerCapture(event.pointerId);
  press.press();
  activeRipple = spawnRipple(fab, event.clientX, event.clientY);
});

fab.addEventListener('pointerup', (event) => {
  press.release();
  activeRipple?.release();
  activeRipple = null;
  const rect = fab.getBoundingClientRect();
  upInside =
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom;
});

fab.addEventListener('pointercancel', () => {
  press.release();
  activeRipple?.release();
  activeRipple = null;
  upInside = false;
});

fab.addEventListener('click', (event) => {
  if (keyboardActivation) {
    keyboardActivation = false;
    return;
  }
  if (!upInside) return;
  const hasPoint = event.clientX !== 0 || event.clientY !== 0;
  requestToggle(hasPoint ? originFromPoint(event.clientX, event.clientY) : fabOrigin());
});

fab.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  keyboardActivation = true;
  press.press();
});

fab.addEventListener('keyup', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  press.release();
  const rect = fab.getBoundingClientRect();
  const ripple = spawnRipple(fab, rect.left + rect.width / 2, rect.top + rect.height / 2);
  ripple.release();
  requestToggle(fabOrigin());
});

/* ---------------- 窗口控制 ---------------- */

titlebar.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'minimize') api?.minimize();
  else if (action === 'maximize') api?.toggleMaximize();
  else if (action === 'close') api?.close();
});

titlebar.addEventListener('dblclick', (event) => {
  if (event.target.closest('[data-action]')) return;
  api?.toggleMaximize();
});

api?.onMaximizeChange?.((maximized) => titlebar.classList.toggle('is-maximized', maximized));

/* ---------------- 主题 ---------------- */

let themeReady = true; // 初始值由 preload 同步写入，后续变化才播动画

function applyTheme(dark) {
  const next = dark ? 'dark' : 'light';
  if (document.documentElement.dataset.theme === next) return;
  const commit = () => {
    document.documentElement.dataset.theme = next;
  };
  if (!themeReady) {
    commit();
    themeReady = true;
    return;
  }
  void runThemeTransition(commit);
}

api?.onThemeChange?.(applyTheme);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', (event) => {
  applyTheme(event.matches);
});

/* ---------------- 快捷键 ---------------- */

window.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey)) return;
  if (event.key.toLowerCase() !== 'e') return;
  event.preventDefault();
  requestToggle(fabOrigin());
});

/* ---------------- 启动 ---------------- */

flushRender();
editor.focus({ preventScroll: true });
