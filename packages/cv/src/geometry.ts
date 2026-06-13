// Quad/point geometry shared by detection, rectification, and the UI overlays.
// Ported verbatim from the prototype (bl / invBl / FULL_QUAD) — no numeric changes.

export interface Point {
  x: number;
  y: number;
}

export interface Quad {
  tl: Point;
  tr: Point;
  br: Point;
  bl: Point;
}

// Bilinear interpolation inside a quad (u,v in 0..1).
export function bl(q: Quad, u: number, v: number): Point {
  const tx = q.tl.x + (q.tr.x - q.tl.x) * u;
  const ty = q.tl.y + (q.tr.y - q.tl.y) * u;
  const bx = q.bl.x + (q.br.x - q.bl.x) * u;
  const by = q.bl.y + (q.br.y - q.bl.y) * u;
  return { x: tx + (bx - tx) * v, y: ty + (by - ty) * v };
}

// Inverse bilinear — recover (u,v) for a point P inside the quad.
export function invBl(q: Quad, P: Point): { u: number; v: number } | null {
  const A = q.tl, B = q.tr, C = q.br, D = q.bl;
  const E = { x: B.x - A.x, y: B.y - A.y };
  const F = { x: D.x - A.x, y: D.y - A.y };
  const G = { x: A.x - B.x + C.x - D.x, y: A.y - B.y + C.y - D.y };
  const H = { x: P.x - A.x, y: P.y - A.y };
  const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
  const k2 = cross(G, F), k1 = cross(E, F) + cross(H, G), k0 = cross(H, E);
  let v: number;
  if (Math.abs(k2) < 1e-9) {
    if (Math.abs(k1) < 1e-9) return null;
    v = -k0 / k1;
  } else {
    const disc = k1 * k1 - 4 * k2 * k0;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    const v1 = (-k1 + s) / (2 * k2), v2 = (-k1 - s) / (2 * k2);
    v = v1 >= -0.25 && v1 <= 1.25 ? v1 : v2;
  }
  const d1 = E.x + G.x * v, d2 = E.y + G.y * v;
  const u = Math.abs(d1) > Math.abs(d2) ? (H.x - F.x * v) / d1 : (H.y - F.y * v) / d2;
  return { u, v };
}

export const FULL_QUAD: Quad = {
  tl: { x: 8, y: 8 },
  tr: { x: 92, y: 8 },
  br: { x: 92, y: 92 },
  bl: { x: 8, y: 92 },
};
