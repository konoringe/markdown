import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';

// 按需注册语言，避免全量引入导致 bundle 膨胀
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import go from 'highlight.js/lib/languages/go';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import less from 'highlight.js/lib/languages/less';
import makefile from 'highlight.js/lib/languages/makefile';
import markdownLang from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import powershell from 'highlight.js/lib/languages/powershell';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import scss from 'highlight.js/lib/languages/scss';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

const LANGUAGES = {
  bash,
  c,
  cpp,
  csharp,
  css,
  diff,
  dockerfile,
  go,
  ini,
  java,
  javascript,
  json,
  kotlin,
  less,
  makefile,
  markdown: markdownLang,
  php,
  powershell,
  python,
  rust,
  scss,
  sql,
  swift,
  typescript,
  xml,
  yaml,
};

// 常用别名，让 ```js / ```py / ```sh 等简写也能命中
const ALIASES = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
  html: 'xml',
  htm: 'xml',
  svg: 'xml',
  c: 'c',
  'c++': 'cpp',
  cc: 'cpp',
  'c#': 'csharp',
  cs: 'csharp',
  rs: 'rust',
  golang: 'go',
  ps1: 'powershell',
  toml: 'ini',
  conf: 'ini',
};

for (const [name, definition] of Object.entries(LANGUAGES)) {
  hljs.registerLanguage(name, definition);
}

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (char) => ESCAPE_MAP[char]);

function highlight(code, lang) {
  const raw = String(lang || '').trim().split(/\s+/)[0].toLowerCase();
  const language = ALIASES[raw] || raw;
  if (language && hljs.getLanguage(language)) {
    try {
      const { value } = hljs.highlight(code, { language, ignoreIllegals: true });
      return `<pre class="md-code"><code class="hljs language-${escapeHtml(language)}">${value}</code></pre>`;
    } catch {
      /* 高亮失败时退回纯文本 */
    }
  }
  return `<pre class="md-code"><code class="hljs">${escapeHtml(code)}</code></pre>`;
}

marked.use({
  gfm: true,
  breaks: true,
  renderer: {
    code({ text, lang }) {
      return highlight(text, lang);
    },
  },
});

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    const href = node.getAttribute('href') || '';
    if (/^https?:/i.test(href)) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  }
});

const SANITIZE_CONFIG = {
  USE_PROFILES: { html: true },
  // 只允许安全协议与文档内锚点、相对路径
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#|\/|\.{1,2}\/)/i,
  ADD_ATTR: ['target', 'rel', 'align', 'colspan', 'rowspan', 'start', 'checked', 'disabled'],
};

export function renderMarkdown(source) {
  if (!source) return '';
  const html = marked.parse(String(source), { async: false });
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}
