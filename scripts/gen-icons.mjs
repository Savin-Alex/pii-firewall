// Generates icons/icon{16,32,48,128}.png with zero deps (Node zlib only).
// Design: brand-blue shield silhouette with a white keyhole, transparent bg.
import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';

const SHIELD = [0, 122, 255];   // #007aff
const KEYHOLE = [255, 255, 255];
const SS = 3;                   // supersampling per axis (anti-alias)

// --- CRC32 (PNG chunks) ---
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// --- shield geometry in normalized [0,1] coords ---
function halfWidth(ny) {
  const top = 0.14, shoulder = 0.52, tip = 0.90, halfW = 0.34, r = 0.10;
  if (ny < top || ny > tip) return -1;
  if (ny <= shoulder) {
    let hw = halfW;
    if (ny < top + r) {
      const dy = (top + r) - ny;
      hw = Math.min(hw, halfW - (r - Math.sqrt(Math.max(0, r * r - dy * dy))));
    }
    return hw;
  }
  const p = (ny - shoulder) / (tip - shoulder);
  return halfW * (1 - Math.pow(p, 1.4));
}
function classify(nx, ny) {
  const hw = halfWidth(ny);
  if (hw < 0 || Math.abs(nx - 0.5) > hw) return null; // outside shield
  const dxk = nx - 0.5, dyk = ny - 0.42;
  const inCircle = dxk * dxk + dyk * dyk <= 0.10 * 0.10;
  const inStem = Math.abs(nx - 0.5) <= 0.045 && ny >= 0.42 && ny <= 0.60;
  return (inCircle || inStem) ? KEYHOLE : SHIELD;
}

function render(N) {
  const raw = Buffer.alloc(N * (N * 4 + 1));
  let o = 0;
  for (let py = 0; py < N; py++) {
    raw[o++] = 0; // filter: none
    for (let px = 0; px < N; px++) {
      let ar = 0, ag = 0, ab = 0, aa = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const nx = (px + (sx + 0.5) / SS) / N;
          const ny = (py + (sy + 0.5) / SS) / N;
          const col = classify(nx, ny);
          if (col) { ar += col[0]; ag += col[1]; ab += col[2]; aa += 255; }
        }
      }
      const n = SS * SS;
      const a = aa / n;
      // premultiplied average avoids dark fringing on the edges
      raw[o++] = a > 0 ? Math.round(ar / (aa / 255)) : 0;
      raw[o++] = a > 0 ? Math.round(ag / (aa / 255)) : 0;
      raw[o++] = a > 0 ? Math.round(ab / (aa / 255)) : 0;
      raw[o++] = Math.round(a);
    }
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(N, 0);
  ihdr.writeUInt32BE(N, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync('icons', { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(`icons/icon${size}.png`, render(size));
  console.log(`icons/icon${size}.png`);
}
