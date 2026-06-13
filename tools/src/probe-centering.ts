// Centering probe — runs the deterministic CV centering on a REAL image file and reports
// honestly where it's shaky, plus renders an annotated overlay (detected card quad + inner
// print frame + measured ratios) and the rectified card so the measurement is auditable.
//
//   npm run centering -w tools -- <path-to-front.jpg> [outDir]

import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  autoQuad, canvasFrom, centeringFromInner, detectInnerFrame, rectify, bl, FULL_QUAD,
  type Canvas2D, type Quad,
} from "@j1m/cv";
import { cloneCanvas } from "@j1m/relief";
import { gradeFromFrontCentering, psaFrontCap } from "@j1m/scoring";
import { nodeCanvasFactory as cf, loadNormalizedImage } from "@j1m/canvas-node";

const path = process.argv[2];
const outDir = process.argv[3] || join(process.cwd(), "probe-out");
if (!path) {
  console.error("usage: npm run centering -w tools -- <path-to-front.jpg> [outDir]");
  process.exit(2);
}

const pxQuad = (q: Quad, W: number, H: number) => ({
  tl: { x: (q.tl.x / 100) * W, y: (q.tl.y / 100) * H },
  tr: { x: (q.tr.x / 100) * W, y: (q.tr.y / 100) * H },
  br: { x: (q.br.x / 100) * W, y: (q.br.y / 100) * H },
  bl: { x: (q.bl.x / 100) * W, y: (q.bl.y / 100) * H },
});

function label(ctx: ReturnType<Canvas2D["getContext"]>, text: string, x: number, y: number, color: string) {
  ctx.font = "bold 22px sans-serif";
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(x - 4, y - 20, text.length * 12 + 8, 26);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

async function main() {
  const norm = await loadNormalizedImage(path);
  const im = await cf.loadImage(norm.dataUrl);
  const src = canvasFrom(cf, im, 2400);

  const detected = autoQuad(canvasFrom(cf, im, 1100));
  const quad = detected || FULL_QUAD;
  const rect = rectify(cf, src, quad);
  const inner = detectInnerFrame(rect);
  const source = detected ? "cv" : "fallback";
  const c = centeringFromInner(inner, source);

  // ---- report ----
  console.log(`\n=== CENTERING PROBE — ${basename(path)} ===`);
  console.log(`normalized: ${norm.width}x${norm.height}  exifOrientation=${norm.exifOrientation}`);
  console.log(`card detected (auto-quad): ${detected ? "YES" : "NO (full-frame fallback)"}`);
  if (c.measured && c.bordersPct) {
    console.log(`inner frame fractions: l=${inner!.l.toFixed(3)} r=${inner!.r.toFixed(3)} t=${inner!.t.toFixed(3)} b=${inner!.b.toFixed(3)}`);
    console.log(`borders %: L=${c.bordersPct.l} R=${c.bordersPct.r} T=${c.bordersPct.t} B=${c.bordersPct.b}`);
    console.log(`RATIOS:  ${c.lr}   ${c.tb}   (worst axis = ${c.worst}%)`);
    console.log(`TAG centering grade: ${gradeFromFrontCentering(c.worst)}   PSA front cap: ${psaFrontCap(c.worst)}`);
    console.log(`source: ${source}`);
  } else {
    console.log("inner frame: NOT LOCKED — centering not measured");
  }

  // ---- honest shakiness assessment ----
  const warn: string[] = [];
  if (!detected) warn.push("auto-quad failed → centering is on the raw frame, unreliable");
  if (!c.measured) warn.push("no inner print-frame lock → ratios unavailable (needs manual lines or a back shot)");
  console.log(warn.length ? `SHAKY: ${warn.join(" · ")}` : "STATUS: clean measurement");

  // ---- overlay render ----
  mkdirSync(outDir, { recursive: true });
  const disp = cloneCanvas(cf, src, 900);
  const W = disp.width, H = disp.height;
  const ctx = disp.getContext("2d");
  const q = pxQuad(quad, W, H);
  ctx.lineWidth = 3;
  ctx.strokeStyle = detected ? "#3DDC97" : "#F5B83D";
  ctx.beginPath();
  ctx.moveTo(q.tl.x, q.tl.y); ctx.lineTo(q.tr.x, q.tr.y); ctx.lineTo(q.br.x, q.br.y); ctx.lineTo(q.bl.x, q.bl.y);
  ctx.closePath(); ctx.stroke();

  if (c.measured && inner) {
    // inner.{l,r,t,b} are already (u,v) positions from the top-left of the card.
    const i0 = bl(quad, inner.l, inner.t), i1 = bl(quad, inner.r, inner.t);
    const i2 = bl(quad, inner.r, inner.b), i3 = bl(quad, inner.l, inner.b);
    const P = (p: { x: number; y: number }) => ({ x: (p.x / 100) * W, y: (p.y / 100) * H });
    const a = P(i0), b = P(i1), d = P(i2), e = P(i3);
    ctx.strokeStyle = "#4FD8E8";
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(d.x, d.y); ctx.lineTo(e.x, e.y);
    ctx.closePath(); ctx.stroke();
    label(ctx, c.lr || "", W * 0.4, 28, "#4FD8E8");
    label(ctx, c.tb || "", 8, H * 0.5, "#4FD8E8");
  } else {
    label(ctx, "NO FRAME LOCK", W * 0.3, 30, "#F5B83D");
  }

  const stem = basename(path).replace(/\.[^.]+$/, "");
  const overlayPath = join(outDir, `${stem}.centering.png`);
  const rectPath = join(outDir, `${stem}.rectified.png`);
  writeFileSync(overlayPath, (disp as unknown as { toBuffer(m: string): Buffer }).toBuffer("image/png"));
  writeFileSync(rectPath, (cloneCanvas(cf, rect, 900) as unknown as { toBuffer(m: string): Buffer }).toBuffer("image/png"));
  console.log(`\noverlay : ${overlayPath}`);
  console.log(`rectified: ${rectPath}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
