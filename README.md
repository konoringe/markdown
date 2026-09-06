# Markdown 实时渲染器

一款运行于 Windows 10 的极简 Markdown 实时渲染桌面应用，遵循 **Material Design 3** 设计规范。在文本框中输入或粘贴 Markdown 原文，应用即时渲染为排版精美的样式；右下角唯一的圆形悬浮按钮（FAB）可在「原文编辑」与「渲染预览」之间一键切换。切换伴随流体圆形揭示、弹簧按压与图标形变等微动效。

## 特性

- **实时渲染**：输入即时解析（标题、列表、引用、表格、任务列表、代码块、链接、图片、行内代码、粗斜体、删除线等），支持 GFM。
- **单圆形按钮切换**：右下角 MD3 FAB，编辑 / 预览一键切换；编辑时底层预览同步更新，切换零延迟、无闪烁；支持 `Ctrl+E`。
- **代码高亮**：代码块按语言着色，配色分别适配浅色 / 深色主题。
- **流体动效**：以 FAB 为原点的圆形揭示切换视图，配合弹簧式按压、涟漪扩散、图标流体形变，连点不错乱，并尊重 `prefers-reduced-motion`。
- **MD3 视觉**：设计令牌驱动，FAB 具备三层高度、状态层与 MD3 缓动动效。
- **主题跟随系统**：默认跟随 Win10 深浅色设置，系统切换时应用实时响应。
- **纯临时内容**：不做任何持久化，关闭即清空。
- **离线可用**：无在线字体 / 图标依赖，全部内联 SVG 与本地 CSS。

## 技术栈

| 层面 | 选择 |
| --- | --- |
| 桌面壳 | Electron 44 |
| 构建 | esbuild（预打包 renderer）+ electron-builder 26（打包为 NSIS 安装包 / 便携 exe） |
| Markdown 解析 | marked |
| 安全净化 | DOMPurify |
| 代码高亮 | highlight.js（按需注册常用语言） |

## 目录结构

```
src/
├── main/main.js          主进程：无边框窗口、nativeTheme 主题监听、窗口控制 IPC
├── main/preload.js       隔离上下文：经 contextBridge 暴露 window.md API
└── renderer/
    ├── index.html        单页骨架（标题栏 / 内容容器 / FAB）
    ├── app.js            视图状态机、rAF 节流渲染、FAB 与快捷键、滚动同步
    ├── markdown.js       marked + highlight.js + DOMPurify 渲染管线
    ├── motion.js         流体动效编排（Web Animations API）
    └── styles/           tokens / base / motion / markdown / fab 五组样式
scripts/
├── build-renderer.mjs    esbuild 打包 renderer → dist/renderer
└── gen-icon.mjs          生成应用图标（build/icon.ico）
dist/renderer/            esbuild 产物（构建生成）
release/                   electron-builder 打包产物（构建生成）
```

## 安装与运行

```bash
npm install
```

开发预览（直接加载未打包源码）：

```bash
npm start
```

## 构建与打包

先打包渲染层，再用 electron-builder 产出安装包 / 便携 exe：

```bash
npm run dist        # 产出 release/ 下的安装包与便携 exe
```

仅重新打包渲染层（调试用）：

```bash
npm run build:renderer
```

> 说明：项目根目录当前为中文路径。Electron 运行不受路径影响；若 `electron-builder` 在某些环境下对中文路径报错，可将本项目复制到英文路径目录后再运行 `npm run dist`。

## 快捷键

- `Ctrl+E`：在原文 / 预览视图间切换（与点击右下角 FAB 效果完全一致）。

## 窗口控制

- 自定义标题栏提供最小化 / 最大化 / 关闭（Win10 风格）。
- 双击标题栏切换最大化。
- 标题栏可拖拽移动窗口。

## 安全说明

- 渲染进程 `nodeIntegration: false` / `contextIsolation: true` / `sandbox: true`；特权能力仅经 preload 的 `contextBridge` 暴露。
- 所有 Markdown 渲染输出经 DOMPurify 净化，URI 仅允许 `http/https/mailto` 与文档内锚点，拦截 `javascript:` / `file:`；外链自动附加 `target="_blank" rel="noopener noreferrer"`。
- 页面级 Content-Security-Policy 限制脚本与样式仅来自同源，禁止 `connect` / `object` / `form-action`。

## 设计令牌

色彩、圆角、高度、字体与动效统一由 `src/renderer/styles/tokens.css` 中的 MD3 设计令牌驱动，组件样式不硬编码颜色，深浅色切换由根元素 `data-theme` 属性整体切换。
