// 流体动效编排：全部基于 Web Animations API，只动 transform / opacity / clip-path
const EASING = {
  emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
  emphasizedDecelerate: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  emphasizedAccelerate: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
};

const settled = (animation) => animation.finished.catch(() => {});

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function nextFrame() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    requestAnimationFrame(() => requestAnimationFrame(finish));
    // 窗口不可见时 rAF 会被暂停，兜底保证切换流程不会卡住
    setTimeout(finish, 120);
  });
}

/** FAB 弹簧按压：按下快速收缩，松手带 overshoot 回弹 */
export function createPress(el) {
  let current = null;
  return {
    press() {
      current?.cancel();
      current = el.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.9)' }], {
        duration: 120,
        easing: EASING.emphasizedAccelerate,
        fill: 'forwards',
      });
    },
    release() {
      if (!current) return;
      const from = getComputedStyle(el).transform;
      current.cancel();
      current = null;
      el.animate(
        [
          { transform: from },
          { transform: 'scale(1.045)', offset: 0.62 },
          { transform: 'scale(1)' },
        ],
        { duration: 420, easing: EASING.spring, fill: 'none' },
      );
    },
  };
}

/** 涟漪状态层：自触点扩散，松手加速收敛 */
export function spawnRipple(host, clientX, clientY) {
  const rect = host.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2.4;
  const el = document.createElement('span');
  el.className = 'fab__ripple';
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.left = `${clientX - rect.left - size / 2}px`;
  el.style.top = `${clientY - rect.top - size / 2}px`;
  host.appendChild(el);

  const grow = el.animate(
    [
      { transform: 'scale(0)', opacity: 0.18 },
      { transform: 'scale(1)', opacity: 0.16 },
    ],
    { duration: 420, easing: EASING.emphasized, fill: 'forwards' },
  );

  return {
    release() {
      try {
        grow.commitStyles();
      } catch {
        /* 忽略提交失败，直接淡出 */
      }
      grow.cancel();
      const fade = el.animate([{ opacity: 0.16 }, { opacity: 0 }], {
        duration: 180,
        easing: EASING.standard,
      });
      settled(fade).then(() => el.remove());
    },
  };
}

/**
 * 切换前的准备：让新层在涟漪开始前整体不可见（内联 visibility 优先级高于任何 CSS，
 * 保证它绝不会被完整绘制出来，从而根除“先闪出新视图再切回旧视图”的叠影/闪烁）。
 * 同时按需把新层裁剪到半径 0，与后续涟漪前沿无缝衔接。
 * reduce-motion 时只隐藏、不裁剪（走交叉淡化），仍保证不闪现。
 */
export function primeReveal(el, origin) {
  el.style.visibility = 'hidden';
  if (prefersReducedMotion()) return;
  const cx = origin?.x ?? 0;
  const cy = origin?.y ?? 0;
  el.style.clipPath = `circle(0px at ${cx}px ${cy}px)`;
}

/**
 * 涟漪切换：从 origin（按钮）涌出一波涟漪，向外扩散直至填满整个窗口。
 * 新视图在涟漪前沿（扩散圆内部）清晰呈现，旧视图在圆外保持清晰，
 * 直到被涟漪覆盖；同时两道波环光环跟随前沿扩散、淡出，形成水波观感。
 */
export function revealLayers({ container, incoming, outgoing, origin, simplify = false }) {
  const rect = container.getBoundingClientRect();
  const reduced = prefersReducedMotion();

  // origin 归一化到容器内（缺省取容器中心），坐标相对容器自身
  const ox = Math.min(Math.max(origin?.x ?? rect.width / 2, 0), rect.width);
  const oy = Math.min(Math.max(origin?.y ?? rect.height / 2, 0), rect.height);
  const at = `${ox}px ${oy}px`;

  // 涟漪半径：覆盖到窗口最远的角落，保证“扩散至整个窗口”
  const radius =
    Math.ceil(
      Math.max(
        Math.hypot(-rect.left - ox, -rect.top - oy),
        Math.hypot(window.innerWidth - rect.left - ox, -rect.top - oy),
        Math.hypot(-rect.left - ox, window.innerHeight - rect.top - oy),
        Math.hypot(window.innerWidth - rect.left - ox, window.innerHeight - rect.top - oy),
      ),
    ) + 1;

  if (reduced) {
    // reduce-motion：干净快速的交叉淡化，绝不闪现
    incoming.style.visibility = '';
    incoming.style.clipPath = '';
    incoming.style.willChange = 'opacity';
    outgoing.style.willChange = 'opacity';
    const inAnim = incoming.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 160,
      easing: EASING.standard,
      fill: 'forwards',
    });
    const outAnim = outgoing.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 160,
      easing: EASING.standard,
      fill: 'forwards',
    });
    return Promise.all([settled(inAnim), settled(outAnim)]).then(() => {
      incoming.style.willChange = '';
      incoming.style.clipPath = '';
      incoming.style.visibility = '';
      outgoing.style.willChange = '';
      outgoing.style.visibility = '';
    });
  }

  // 恢复可见，并预置与首帧一致的裁剪半径 0：此刻起新层可见但不透出，随前沿逐寸揭开
  incoming.style.visibility = '';
  incoming.style.clipPath = `circle(0px at ${at})`;
  incoming.style.willChange = 'clip-path';

  // 涟漪前沿：新视图被一个自按钮扩大的圆逐寸揭开，边缘即水波前锋。
  // fill:'forwards' 让末端保持在完整半径，避免动画结束后回落到首帧（半径 0）造成“闪回旧文本”。
  const front = incoming.animate(
    [
      { clipPath: `circle(0px at ${at})` },
      { clipPath: `circle(${radius}px at ${at})` },
    ],
    { duration: simplify ? 440 : 740, easing: EASING.emphasizedDecelerate, fill: 'forwards' },
  );

  // 波环光环：跟随前沿向外扩散、逐渐淡出，强化“一波涟漪”的观感
  const cx = rect.left + ox; // 换算成窗口坐标（光环挂在 body 上）
  const cy = rect.top + oy;
  const rings = [];
  if (simplify) {
    rings.push(
      spawnRippleRing(cx, cy, radius, {
        stops: 'transparent 72%, currentColor 86%, currentColor 96%, transparent 100%',
        duration: 520,
        delay: 0,
        peakOpacity: 0.26,
        fadeOffset: 0.6,
      }),
    );
  } else {
    rings.push(
      spawnRippleRing(cx, cy, radius, {
        stops: 'transparent 72%, currentColor 86%, currentColor 96%, transparent 100%',
        duration: 860,
        delay: 0,
        peakOpacity: 0.3,
        fadeOffset: 0.6,
      }),
      spawnRippleRing(cx, cy, radius, {
        stops: 'transparent 50%, currentColor 62%, currentColor 72%, transparent 80%',
        duration: 960,
        delay: 120,
        peakOpacity: 0.2,
        fadeOffset: 0.5,
      }),
    );
  }

  return Promise.all([settled(front), ...rings]).then(() => {
    // 把“完整半径”的最终状态写回内联样式后再取消动画，保证不会回落到半径 0
    try {
      front.commitStyles();
    } catch {
      /* 忽略提交失败 */
    }
    front.cancel();
    incoming.style.clipPath = '';
    incoming.style.visibility = '';
    incoming.style.willChange = '';
  });
}

/** 生成一个自 (cx, cy) 扩散、到达整个窗口后淡出的波环光环元素 */
function spawnRippleRing(cx, cy, coverRadius, { stops, duration, delay, peakOpacity, fadeOffset }) {
  const el = document.createElement('div');
  el.className = 'reveal__ring';
  const r = coverRadius + 80; // 让光环最外沿能越过窗口四角
  el.style.width = `${r * 2}px`;
  el.style.height = `${r * 2}px`;
  el.style.left = `${cx - r}px`;
  el.style.top = `${cy - r}px`;
  el.style.background = `radial-gradient(circle closest-side, ${stops})`;
  document.body.appendChild(el);

  const anim = el.animate(
    [
      { transform: 'scale(0)', opacity: 0 },
      { transform: 'scale(1)', opacity: peakOpacity, offset: 0.14 },
      { transform: 'scale(1)', opacity: peakOpacity, offset: fadeOffset },
      { transform: 'scale(1)', opacity: 0 },
    ],
    { duration, delay, easing: EASING.emphasizedDecelerate, fill: 'forwards' },
  );

  return settled(anim).then(() => el.remove());
}

/** 图标流体形变：入场自旋转缩放归位，出场反向退去，并带一次描边绘制 */
export function morphIcons(activeEl, inactiveEl) {
  const reduced = prefersReducedMotion();
  const duration = reduced ? 120 : 300;

  const enter = activeEl.animate(
    [
      { opacity: 0, transform: 'rotate(72deg) scale(0.45)' },
      { opacity: 1, transform: 'rotate(0deg) scale(1)' },
    ],
    { duration, easing: EASING.spring, fill: 'none' },
  );

  const leave = inactiveEl.animate(
    [
      { opacity: 1, transform: 'rotate(0deg) scale(1)' },
      { opacity: 0, transform: 'rotate(-72deg) scale(0.45)' },
    ],
    { duration: Math.round(duration * 0.72), easing: EASING.emphasizedAccelerate, fill: 'none' },
  );

  if (!reduced) {
    for (const shape of activeEl.querySelectorAll('path, circle')) {
      let length = 0;
      try {
        length = shape.getTotalLength();
      } catch {
        length = 0;
      }
      if (!length) continue;
      shape.animate(
        [
          { strokeDasharray: `${length}`, strokeDashoffset: `${length}` },
          { strokeDasharray: `${length}`, strokeDashoffset: '0' },
        ],
        { duration: 160, delay: 80, easing: EASING.emphasizedDecelerate, fill: 'none' },
      );
    }
  }

  return Promise.all([settled(enter), settled(leave)]);
}

/** 主题切换的流体扩散，不支持 View Transitions 时直接应用 */
export function runThemeTransition(apply) {
  const supported = typeof document.startViewTransition === 'function' && !prefersReducedMotion();
  if (!supported) {
    apply();
    return Promise.resolve();
  }
  const transition = document.startViewTransition(() => apply());
  return settled(transition.finished);
}

/** 预览内容的交错渐入 */
export function staggerIn(container, limit = 24) {
  if (prefersReducedMotion() || limit === 0) return;
  const blocks = Array.from(container.children).slice(0, limit);
  blocks.forEach((el, index) => {
    el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], {
      duration: 200,
      delay: index * 16,
      easing: EASING.emphasizedDecelerate,
      fill: 'backwards',
    });
  });
}
