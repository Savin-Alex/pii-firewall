// Derives icons/icon{16,32,48,128}.png from "PII Logo.png" (zero deps, Node only).
// The source is opaque RGB with a light background; we flood-fill the OUTER
// background to transparent from the borders (the blue shield encloses the inner
// eye, so its white details are preserved), then box-downsample with alpha.
import { deflateSync, inflateSync } from 'zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const SRC = 'PII Logo.png';

// --- PNG decode (8-bit, non-interlaced, colorType 2/6) ---
function decode(buf) {
  let p = 8, w, h, colorType, bitDepth, interlace;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; interlace = data[12]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported PNG (bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace})`);
  }
  const ch = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  const paeth = (a, b, c) => { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[y * stride + x - ch] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= ch && y > 0 ? out[(y - 1) * stride + x - ch] : 0;
      let v = row[x];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1; else if (ft === 4) v += paeth(a, b, c);
      out[y * stride + x] = v & 0xff;
    }
  }
  // normalise to RGBA
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = out[i * ch]; rgba[i * 4 + 1] = out[i * ch + 1]; rgba[i * 4 + 2] = out[i * ch + 2];
    rgba[i * 4 + 3] = ch === 4 ? out[i * ch + 3] : 255;
  }
  return { w, h, rgba };
}

// --- flood-fill outer light background -> alpha 0 ---
function cutBackground({ w, h, rgba }) {
  const isLight = (i) => rgba[i * 4] > 170 && rgba[i * 4 + 1] > 170 && rgba[i * 4 + 2] > 170;
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => { if (x >= 0 && x < w && y >= 0 && y < h) { const i = y * w + x; if (!seen[i] && isLight(i)) { seen[i] = 1; stack.push(i); } } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const i = stack.pop();
    rgba[i * 4 + 3] = 0; // transparent
    const x = i % w, y = (i / w) | 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  return { w, h, rgba };
}

// --- box downsample with premultiplied alpha ---
function downsample(src, N) {
  const { w, h, rgba } = src;
  const out = Buffer.alloc(N * N * 4);
  for (let ty = 0; ty < N; ty++) {
    for (let tx = 0; tx < N; tx++) {
      const x0 = Math.floor(tx * w / N), x1 = Math.max(x0 + 1, Math.floor((tx + 1) * w / N));
      const y0 = Math.floor(ty * h / N), y1 = Math.max(y0 + 1, Math.floor((ty + 1) * h / N));
      let ar = 0, ag = 0, ab = 0, aa = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4, a = rgba[i + 3];
        ar += rgba[i] * a; ag += rgba[i + 1] * a; ab += rgba[i + 2] * a; aa += a; n++;
      }
      const o = (ty * N + tx) * 4;
      out[o] = aa ? Math.round(ar / aa) : 0;
      out[o + 1] = aa ? Math.round(ag / aa) : 0;
      out[o + 2] = aa ? Math.round(ab / aa) : 0;
      out[o + 3] = Math.round(aa / n);
    }
  }
  return out;
}

// --- PNG encode (RGBA) ---
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0); const body = Buffer.concat([Buffer.from(type, 'ascii'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0); return Buffer.concat([len, body, crc]); }
function encode(N, rgba) {
  const raw = Buffer.alloc(N * (N * 4 + 1));
  for (let y = 0; y < N; y++) { raw[y * (N * 4 + 1)] = 0; rgba.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const logo = cutBackground(decode(readFileSync(SRC)));
mkdirSync('icons', { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(`icons/icon${size}.png`, encode(size, downsample(logo, size)));
  console.log(`icons/icon${size}.png`);
}
