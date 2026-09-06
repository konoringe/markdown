// 纯 Node 生成 MD3 风格应用图标：圆角方块 + 主色对角渐变 + 白色对勾，输出 build/icon.ico
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 256;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'build');

const C_A = [0x67, 0x50, 0xa4]; // primary
const C_B = [0x4f, 0x37, 0x8b]; // primary-container(深色端)
const C_MARK = [0xff, 0xff, 0xff];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;

function sdRoundRect(px, py, cx, cy, half, radius) {
  const dx = Math.abs(px - cx) - (half - radius);
  const dy = Math.abs(py - cy) - (half - radius);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - radius;
}

function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = clamp01((pax * bax + pay * bay) / (bax * bax + bay * bay));
  return Math.hypot(pax - bax * h, pay - bay * h);
}

// 1) 光栅化 RGBA 扫描线
const stride = SIZE * 4;
const raw = Buffer.alloc(SIZE * (stride + 1));
const cx = SIZE / 2;
const cy = SIZE / 2;
const half = SIZE / 2 - 18;
const radius = 52;

for (let y = 0; y < SIZE; y++) {
  const rowStart = y * (stride + 1);
  raw[rowStart] = 0; // filter type: none
  for (let x = 0; x < SIZE; x++) {
    const px = x + 0.5;
    const py = y + 0.5;
    const alpha = clamp01(0.5 - sdRoundRect(px, py, cx, cy, half, half, radius));
    const t = (x + y) / (2 * SIZE);
    let r = mix(C_A[0], C_B[0], t);
    let g = mix(C_A[1], C_B[1], t);
    let b = mix(C_A[2], C_B[2], t);
    const dMark = Math.min(
      sdSegment(px, py, 78, 134, 114, 172),
      sdSegment(px, py, 114, 172, 182, 92),
    );
    const aMark = clamp01(0.5 - (dMark - 10));
    r = mix(r, C_MARK[0], aMark);
    g = mix(g, C_MARK[1], aMark);
    b = mix(b, C_MARK[2], aMark);
    const o = rowStart + 1 + x * 4;
    raw[o] = Math.round(r);
    raw[o + 1] = Math.round(g);
    raw[o + 2] = Math.round(b);
    raw[o + 3] = Math.round(alpha * 255);
  }
}

// 2) 编码 PNG
const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type: RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

// 3) 封装 ICO（256 尺寸的宽高字段写 0）
const ico = Buffer.alloc(22);
ico.writeUInt16LE(0, 0); // reserved
ico.writeUInt16LE(1, 2); // type: icon
ico.writeUInt16LE(1, 4); // image count
ico[6] = 0; // width = 256
ico[7] = 0; // height = 256
ico.writeUInt16LE(1, 10); // planes
ico.writeUInt16LE(32, 12); // bits per pixel
ico.writeUInt32LE(png.length, 14);
ico.writeUInt32LE(22, 18);

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'icon.ico'), Buffer.concat([ico, png]));
console.log(`[icon] build/icon.ico (${SIZE}x${SIZE})`);
