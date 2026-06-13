// Branded "slab" graphic generator. Kept UI-free: the logo source, accent colors, and
// fonts are passed in by the caller (apps/web/brand) so this package stays presentation-
// agnostic. Geometry/styling ported verbatim from the prototype.

import type { Canvas2D, CanvasFactory } from "@j1m/cv";

export interface SlabMeta {
  name?: string;
  set?: string;
  number?: string;
  cert: string;
  grade10?: number | string | null;
  score1000?: number | string | null;
  condition?: string;
}

export interface SlabBrand {
  logoSrc: string;
  yellow: string;
  cream: string;
  mono: string;
  grot: string;
}

function rr(x: ReturnType<Canvas2D["getContext"]>, a: number, b: number, w: number, h: number, r: number) {
  x.beginPath();
  x.moveTo(a + r, b);
  x.arcTo(a + w, b, a + w, b + h, r);
  x.arcTo(a + w, b + h, a, b + h, r);
  x.arcTo(a, b + h, a, b, r);
  x.arcTo(a, b, a + w, b, r);
  x.closePath();
}

export async function makeSlab(
  cf: CanvasFactory,
  rect: Canvas2D,
  meta: SlabMeta,
  brand: SlabBrand
): Promise<string> {
  const logo = await cf.loadImage(brand.logoSrc);
  const W = 980, H = 1380;
  const c = cf.createCanvas(W, H);
  const x = c.getContext("2d");
  x.fillStyle = "#0B0E14";
  x.fillRect(0, 0, W, H);
  rr(x, 26, 26, W - 52, H - 52, 44);
  x.fillStyle = "#E8ECF1";
  x.fill();
  rr(x, 26, 26, W - 52, H - 52, 44);
  x.strokeStyle = "#C3CBD6";
  x.lineWidth = 3;
  x.stroke();
  const lx = 48, ly = 48, lw = W - 96, lh = 236;
  const g = x.createLinearGradient(0, ly, 0, ly + lh);
  g.addColorStop(0, "#1FA350");
  g.addColorStop(1, "#0E6B30");
  rr(x, lx, ly, lw, lh, 20);
  x.fillStyle = g;
  x.fill();
  const ls = 168;
  rr(x, lx + 22, ly + 24, ls, ls, 16);
  x.save();
  x.clip();
  x.drawImage(logo, lx + 22, ly + 24, ls, ls);
  x.restore();
  rr(x, lx + 22, ly + 24, ls, ls, 16);
  x.strokeStyle = brand.yellow;
  x.lineWidth = 3;
  x.stroke();
  const name = (meta.name || "Card").slice(0, 22);
  x.fillStyle = brand.cream;
  x.font = `bold 38px ${brand.grot}`;
  x.fillText(name, lx + 214, ly + 72);
  x.font = `16px ${brand.mono}`;
  x.fillStyle = "#CFE8D6";
  x.fillText(`${(meta.set || "").toUpperCase()}  ·  ${meta.number || ""}`.slice(0, 42), lx + 214, ly + 102);
  x.fillText(`CERT ${meta.cert}`, lx + 214, ly + 128);
  x.font = `bold 23px ${brand.grot}`;
  x.fillStyle = brand.yellow;
  x.fillText("J 1 M ' S   G R A D I N G", lx + 214, ly + lh - 28);
  x.textAlign = "right";
  x.fillStyle = brand.yellow;
  x.font = `bold 104px ${brand.grot}`;
  x.fillText(String(meta.grade10 ?? "—"), lx + lw - 30, ly + 122);
  x.font = `bold 18px ${brand.grot}`;
  x.fillStyle = brand.cream;
  x.fillText(meta.condition || "", lx + lw - 30, ly + 152);
  x.font = `21px ${brand.mono}`;
  x.fillStyle = "#CFE8D6";
  x.fillText(`${meta.score1000 ?? "—"} / 1000`, lx + lw - 30, ly + 184);
  x.textAlign = "left";
  const chTop = ly + lh + 28, availH = H - chTop - 76;
  const cardH = availH, cardW = cardH * (rect.width / rect.height);
  const cx0 = (W - cardW) / 2;
  rr(x, cx0 - 16, chTop - 16, cardW + 32, cardH + 32, 18);
  x.fillStyle = "#10141B";
  x.fill();
  rr(x, cx0, chTop, cardW, cardH, 12);
  x.save();
  x.clip();
  x.drawImage(rect, cx0, chTop, cardW, cardH);
  x.restore();
  rr(x, cx0, chTop, cardW, cardH, 12);
  x.strokeStyle = brand.yellow;
  x.lineWidth = 3;
  x.stroke();
  x.save();
  x.globalAlpha = 0.07;
  x.fillStyle = "#fff";
  x.beginPath();
  x.moveTo(W * 0.18, 26);
  x.lineTo(W * 0.36, 26);
  x.lineTo(W * 0.12, H - 26);
  x.lineTo(50, H - 26);
  x.closePath();
  x.fill();
  x.restore();
  return c.toDataURL("image/png");
}
