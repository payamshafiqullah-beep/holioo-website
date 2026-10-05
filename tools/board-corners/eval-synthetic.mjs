// Accuracy of the board detector (pwa/features/scan-detect.js) on randomised synthetic photos.
//
//   node tools/board-corners/eval-synthetic.mjs [count=150] [seed=1] [--verbose]
//
// Every photo is a board (white / black / green / brown, with or without a frame) on a wall (white /
// coloured / glossy / textured), with a random viewing angle, brightness fall-off, hard shadow, glare,
// sensor noise and blur. A detection is correct when its overlap with the true board (IoU) is at least
// 0.90. The confidence score is checked too: of the detections it calls reliable (>= 80 %), how many are
// really correct, and how many correct ones it flags as doubtful.
//
// Synthetic photos are far easier than real classrooms: this number is a regression gauge for the
// detector (compare before / after a change), NOT the accuracy users will see. Real photos: eval.html.
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as S from '../../pwa/tests/helpers/scenes.mjs';

const args = process.argv.slice(2),
  verbose = args.includes('--verbose'),
  nums = args.filter((a) => !a.startsWith('--')).map(Number);
const COUNT = nums[0] || 150,
  SEED = nums[1] || 1;
const root = new URL('../../pwa/', import.meta.url);
const require = createRequire(import.meta.url);
const ctx = { console };
ctx.self = ctx;
vm.createContext(ctx);
for (const f of ['features/scan-core.js', 'features/scan-refine.js', 'features/scan-detect.js'])
  vm.runInContext(fs.readFileSync(new URL(f, root), 'utf8'), ctx);
const cv = await new Promise((res) => {
  const c = require('@techstark/opencv-js');
  const d = () => {
    if (typeof c.then === 'function') delete c.then;
    res(c);
  };
  if (c.Mat) d();
  else c.onRuntimeInitialized = d;
});

let s = SEED * 9301 + 49297;
const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647,
  pick = (a) => a[Math.floor(rnd() * a.length)],
  between = (a, b) => a + (b - a) * rnd();
const W = 512,
  H = 384,
  clamp = (v) => Math.max(0, Math.min(255, v));
const lum = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
const shift = (c, d) => c.map((v) => clamp(v + d));

// ─── geometry: IoU of two convex quads (Sutherland–Hodgman clipping) ───
function clip(subject, clipper) {
  let out = subject;
  for (let i = 0; i < clipper.length; i++) {
    const a = clipper[i],
      b = clipper[(i + 1) % clipper.length],
      input = out;
    out = [];
    const inside = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0;
    const cut = (p, q) => {
      const d1 = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]),
        d2 = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]),
        t = d1 / (d1 - d2);
      return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    };
    for (let j = 0; j < input.length; j++) {
      const p = input[j],
        q = input[(j + 1) % input.length];
      if (inside(p)) {
        out.push(p);
        if (!inside(q)) out.push(cut(p, q));
      } else if (inside(q)) out.push(cut(p, q));
    }
    if (!out.length) break;
  }
  return out;
}
const polyArea = (p) => {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i],
      [x2, y2] = p[(i + 1) % p.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
};
const iou = (a, b) => {
  const A = polyArea(a),
    B = polyArea(b);
  let I = polyArea(clip(a, b));
  if (!I) I = 0;
  return I / (A + B - I);
};

// ─── one random scene ───
function scene() {
  const kind = pick(['white', 'white', 'black', 'green', 'brown']);
  const wallKind = pick(['white', 'colored', 'glossy', 'textured', 'dark']);
  const board = { white: [236, 238, 240], black: [22, 26, 24], green: [44, 96, 70], brown: [118, 84, 58] }[kind];
  let wall = {
    white: [214, 210, 202],
    colored: [pick([60, 120, 180]), pick([70, 130, 190]), pick([80, 140, 200])],
    glossy: [200, 196, 190],
    textured: [170, 160, 148],
    dark: [48, 50, 52],
  }[wallKind];
  // keep the brightness step between board and wall from being zero most of the time (the faint ones stay in)
  const step = Math.abs(lum(board) - lum(wall));
  if (step < 10 && rnd() < 0.7) wall = shift(wall, pick([-1, 1]) * between(25, 70));
  const img = S.makeImage(W, H, wall);
  if (wallKind === 'textured') {
    const { data } = img;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const g = Math.sin(x * 0.9) * Math.sin(y * 0.7) * 9 + Math.sin(y * 0.21) * 6,
          i = (y * W + x) * 4;
        data[i] += g;
        data[i + 1] += g;
        data[i + 2] += g;
      }
  }
  S.noise(img, between(2, 6), Math.floor(rnd() * 1e6) + 1);
  // viewing angle: the far side is shorter; the board is slightly rotated
  const cx = between(0.42, 0.58) * W,
    cy = between(0.42, 0.56) * H,
    bw = between(0.5, 0.82) * W,
    bh = bw * between(0.5, 0.68);
  const left = 1,
    right = between(0.62, 1),
    yaw = rnd() < 0.5;
  const hL = (yaw ? left : right) * bh,
    hR = (yaw ? right : left) * bh,
    rot = between(-0.12, 0.12);
  const raw = [
    [-bw / 2, -hL / 2],
    [bw / 2, -hR / 2],
    [bw / 2, hR / 2],
    [-bw / 2, hL / 2],
  ];
  const q = raw.map(([x, y]) => [
    cx + x * Math.cos(rot) - y * Math.sin(rot),
    cy + x * Math.sin(rot) + y * Math.cos(rot),
  ]);
  const framed = rnd() < 0.6,
    thick = between(0.008, 0.02),
    frameColor = pick([
      [140, 144, 150],
      [150, 110, 70],
      [70, 72, 76],
      [200, 200, 204],
    ]);
  const inQ = (q, u, v) => S.inQuad(q, u, v);
  const outer = framed
    ? [inQ(q, -thick, -thick), inQ(q, 1 + thick, -thick), inQ(q, 1 + thick, 1 + thick), inQ(q, -thick, 1 + thick)]
    : q;
  if (framed) S.fillPoly(img, outer, frameColor);
  S.fillPoly(img, q, board);
  S.textLines(img, q, lum(board) > 128 ? [34, 64, 150] : [226, 230, 222], {
    lines: Math.floor(between(3, 9)),
    seed: Math.floor(rnd() * 1e5) + 1,
    u0: 0.1,
    u1: 0.85,
    v0: 0.12,
    v1: 0.8,
  });
  // light
  if (rnd() < 0.6) S.shade(img, between(0.9, 1.3), between(0.4, 0.9));
  const shadow = rnd() < 0.35;
  if (shadow) {
    const yy = between(0.2, 0.7) * H;
    S.fillPoly(
      img,
      [
        [0, yy],
        [W, yy - between(-60, 60)],
        [W, yy + between(40, 90)],
        [0, yy + between(40, 90)],
      ],
      [0, 0, 0],
      between(0.25, 0.5),
    );
  }
  const glareOn = rnd() < 0.4 || wallKind === 'glossy';
  if (glareOn)
    S.glare(
      img,
      Math.floor(between(0.2, 0.8) * W),
      Math.floor(between(0.15, 0.7) * H),
      Math.floor(between(40, 110)),
      between(0.4, 0.9),
    );
  const dark = rnd() < 0.3;
  if (dark) for (let i = 0; i < img.data.length; i += 4) for (let c = 0; c < 3; c++) img.data[i + c] *= 0.38; // dark classroom
  S.noise(img, between(2, 10), Math.floor(rnd() * 1e6) + 1);
  if (rnd() < 0.2) S.blur(img, 1);
  return {
    img,
    quad: outer.map(([x, y]) => [x / W, y / H]),
    inner: q.map(([x, y]) => [x / W, y / H]),
    kind,
    wallKind,
    framed,
    tags: { shadow, glare: glareOn, dark, framed, bare: !framed },
  };
}

const rows = [];
let ms = 0;
for (let i = 0; i < COUNT; i++) {
  const sc = scene(),
    t = performance.now(),
    r = ctx.scanDetect(cv, sc.img, 'board');
  ms += performance.now() - t;
  // A framed board may be cropped at its outer or inner edge: both are right.
  const score = r.quad ? Math.max(iou(r.quad, sc.quad), iou(r.quad, sc.inner)) : 0;
  rows.push({
    i,
    tags: sc.tags,
    kind: sc.kind,
    wall: sc.wallKind,
    framed: sc.framed,
    found: !!r.quad,
    iou: score,
    conf: r.confidence,
    ok: score >= 0.9,
    source: r.source,
  });
  if (verbose)
    console.log(
      String(i).padStart(3),
      sc.kind.padEnd(6),
      sc.wallKind.padEnd(8),
      sc.framed ? 'frame' : 'bare ',
      r.quad
        ? `IoU ${score.toFixed(3)} conf ${r.confidence != null ? Math.round(r.confidence * 100) : '-'}% ${r.source}`
        : 'NOT FOUND',
    );
}
const ok = rows.filter((r) => r.ok).length,
  found = rows.filter((r) => r.found).length;
console.log(
  `\n${COUNT} synthetic boards (seed ${SEED}): ${ok} correct (IoU>=0.90) = ${((100 * ok) / COUNT).toFixed(1)} %   found ${found}   mean ${(ms / COUNT).toFixed(0)} ms / frame`,
);
for (const key of ['kind', 'wall']) {
  const g = {};
  for (const r of rows) {
    g[r[key]] ??= { n: 0, ok: 0 };
    g[r[key]].n++;
    if (r.ok) g[r[key]].ok++;
  }
  console.log(
    `  by ${key}: ${Object.entries(g)
      .map(([k, v]) => `${k} ${v.ok}/${v.n}`)
      .join(' · ')}`,
  );
}
{
  const t = {};
  for (const r of rows)
    for (const [k, v] of Object.entries(r.tags))
      if (v) {
        t[k] ??= { n: 0, ok: 0 };
        t[k].n++;
        if (r.ok) t[k].ok++;
      }
  const clean = rows.filter((r) => !r.tags.shadow && !r.tags.glare && !r.tags.dark);
  console.log(
    `  by condition: ${Object.entries(t)
      .map(([k, v]) => `${k} ${v.ok}/${v.n}`)
      .join(' · ')}`,
  );
  console.log(`  no shadow, glare or darkness: ${clean.filter((r) => r.ok).length}/${clean.length}`);
}
if (rows.some((r) => r.conf != null)) {
  const sure = rows.filter((r) => r.found && r.conf >= 0.8),
    doubt = rows.filter((r) => r.found && r.conf < 0.8);
  console.log(
    `  confidence >= 80 %: ${sure.length} detections, ${sure.filter((r) => r.ok).length} correct (${sure.length ? ((100 * sure.filter((r) => r.ok).length) / sure.length).toFixed(1) : '-'} %)`,
  );
  console.log(
    `  confidence <  80 %: ${doubt.length} detections, ${doubt.filter((r) => r.ok).length} of them were correct anyway`,
  );
}
