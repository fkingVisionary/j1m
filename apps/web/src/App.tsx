import { useState, useRef, useCallback } from "react";
import {
  autoQuad, canvasFrom, centeringFromInner, detectInnerFrame, rectify, bl, invBl, FULL_QUAD,
  type Quad, type Centering, type InnerFrame, type Canvas2D,
} from "@j1m/cv";
import { cloneCanvas, embossInPlace, toJpg, makeSlab, type CropPair } from "@j1m/relief";
import {
  CONDITION, gradeFromFrontCentering, gradeFromBackCenteringTCG, psaFrontCap,
  type SynthResult, type CornerScores, type EdgeScores, type Finding,
} from "@j1m/scoring";
import {
  runPipeline, STAGE_KEYS, type CardId, type SegGrid, type Provenance,
  type StageKey, type StageStatus, type Depth,
} from "@j1m/pipeline";
import { normalizeImage, UnsupportedImageError } from "@j1m/imaging";
import { LOGO_URL, T, MONO, GROT, scoreColor, sevColor } from "./lib/brand.js";
import { browserCanvasFactory } from "./lib/canvasFactory.js";
import { proxyClient } from "./lib/apiClient.js";
import { BorderBars, Pill, UploadSlot } from "./components/ui.js";

const cf = browserCanvasFactory;

const STAGE_LABELS: Record<StageKey, string> = {
  detect: "Locate card & measure centering (local CV)",
  id: "Identify card & foil type",
  corners: "Corner inspection (zoomed)",
  edges: "Edge inspection (zoomed)",
  surface: "Surface deep sweep (segment grid)",
  structural: "Structural check (creases / dents / bends)",
  verify: "Second-look defect verification",
  synth: "Rubric scoring & listing",
};

interface UploadImage { dataUrl: string; }

export default function J1msGrading() {
  const [front, setFront] = useState<UploadImage | null>(null);
  const [back, setBack] = useState<UploadImage | null>(null);
  const [rake, setRake] = useState<UploadImage | null>(null);
  const [depth, setDepth] = useState<Depth>("deep");
  const [quad, setQuad] = useState<Quad | null>(null);
  const [adjust, setAdjust] = useState(false);
  const [stage, setStage] = useState<Partial<Record<StageKey, StageStatus>>>({});
  const [segNote, setSegNote] = useState("");
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [centerF, setCenterF] = useState<Centering | null>(null);
  const [centerB, setCenterB] = useState<Centering | null>(null);
  const [cardId, setCardId] = useState<CardId | null>(null);
  const [corners, setCorners] = useState<CornerScores | null>(null);
  const [edges, setEdges] = useState<EdgeScores | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [rejected, setRejected] = useState<Finding[]>([]);
  const [segGrid, setSegGrid] = useState<SegGrid | null>(null);
  const [synth, setSynth] = useState<SynthResult | null>(null);
  const [crops, setCrops] = useState<CropPair[]>([]);
  const [rejCrops, setRejCrops] = useState<CropPair[]>([]);
  const [reliefUrl, setReliefUrl] = useState<string | null>(null);
  const [vision, setVision] = useState(0);
  const [layers, setLayers] = useState({ dings: true, corners: true, edges: true, centering: true, heatmap: false });
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const [errMsg, setErrMsg] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [slabUrl, setSlabUrl] = useState<string | null>(null);
  const [slabBusy, setSlabBusy] = useState(false);
  const [prov, setProv] = useState<Provenance | null>(null);
  const [showProv, setShowProv] = useState(false);

  const refs = useRef<{
    srcCanvas: Canvas2D | null; rectCanvas: Canvas2D | null; quad: Quad | null;
    inner: InnerFrame | null; innerSource: string | null; runId: number;
    timer: ReturnType<typeof setInterval> | null; viewer: HTMLDivElement | null; dragging: string | null;
  }>({ srcCanvas: null, rectCanvas: null, quad: null, inner: null, innerSource: null, runId: 0, timer: null, viewer: null, dragging: null });

  const applyInner = useCallback((inner: InnerFrame | null, source: string) => {
    refs.current.inner = inner;
    refs.current.innerSource = source;
    setCenterF(centeringFromInner(inner, source));
  }, []);

  const initLocal = useCallback(async (dataUrl: string) => {
    setDetecting(true);
    try {
      const im = await cf.loadImage(dataUrl);
      refs.current.srcCanvas = canvasFrom(cf, im, 2400);
      const q = autoQuad(canvasFrom(cf, im, 1100)) || FULL_QUAD;
      refs.current.quad = q; setQuad(q);
      const rect = rectify(cf, refs.current.srcCanvas, q);
      refs.current.rectCanvas = rect;
      applyInner(detectInnerFrame(rect), "cv");
      setReliefUrl(toJpg(embossInPlace(cloneCanvas(cf, rect, 900))));
    } catch (e) { console.error(e); }
    setDetecting(false);
  }, [applyInner]);

  const pick = useCallback(async (file: File, which: "front" | "back" | "rake") => {
    try {
      const norm = await normalizeImage(file);
      const img = { dataUrl: norm.dataUrl };
      if (which === "front") {
        setFront(img); setQuad(null); setCenterF(null); setCardId(null); setCorners(null);
        setEdges(null); setFindings([]); setRejected([]); setSegGrid(null); setSynth(null);
        setCrops([]); setRejCrops([]); setReliefUrl(null); setVision(0); setStage({});
        setErrMsg(""); setFocusIdx(null); setSlabUrl(null); setSegNote(""); setProv(null);
        refs.current.srcCanvas = null; refs.current.rectCanvas = null; refs.current.quad = null;
        refs.current.inner = null; refs.current.innerSource = null;
        initLocal(norm.dataUrl);
      } else if (which === "back") { setBack(img); setCenterB(null); }
      else setRake(img);
    } catch (e) {
      setErrMsg(e instanceof UnsupportedImageError ? e.message : "Could not read image — try a JPEG or PNG.");
    }
  }, [initLocal]);

  const recomputeLocal = useCallback(async (q: Quad) => {
    if (!front || !q) return;
    if (!refs.current.srcCanvas) {
      const im = await cf.loadImage(front.dataUrl);
      refs.current.srcCanvas = canvasFrom(cf, im, 2400);
    }
    const rect = rectify(cf, refs.current.srcCanvas, q);
    refs.current.rectCanvas = rect;
    if (refs.current.innerSource !== "manual") applyInner(detectInnerFrame(rect), "cv");
    else setCenterF(centeringFromInner(refs.current.inner, "manual"));
    setReliefUrl(toJpg(embossInPlace(cloneCanvas(cf, rect, 900))));
  }, [front, applyInner]);

  const setStg = (k: StageKey, v: StageStatus) => setStage((p) => ({ ...p, [k]: v }));

  const run = async () => {
    if (!front || running) return;
    const runId = ++refs.current.runId;
    const alive = () => refs.current.runId === runId;
    setRunning(true); setErrMsg(""); setSynth(null); setCorners(null); setEdges(null);
    setFindings([]); setRejected([]); setSegGrid(null); setCrops([]); setRejCrops([]);
    setFocusIdx(null); setStage({}); setElapsed(0); setSlabUrl(null); setSegNote(""); setProv(null);
    const t0 = Date.now();
    refs.current.timer = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    try {
      const inputQuad = refs.current.quad || quad || undefined;
      const inputInner = refs.current.innerSource === "manual" ? refs.current.inner : undefined;
      const res = await runPipeline(
        { front: front.dataUrl, back: back?.dataUrl, rake: rake?.dataUrl, depth, quad: inputQuad, inner: inputInner },
        {
          cf, ai: proxyClient, hooks: {
            onStage: (k, s) => { if (alive()) setStg(k, s); },
            onCentering: (f, b) => {
              if (!alive()) return;
              setCenterF(f); setCenterB(b);
              if (refs.current.innerSource !== "manual") refs.current.inner = f.inner ?? null;
            },
            onRelief: (u) => { if (alive()) setReliefUrl(u); },
            onCardId: (id) => { if (alive()) setCardId(id); },
            onCorners: (c) => { if (alive()) setCorners(c); },
            onEdges: (e) => { if (alive()) setEdges(e); },
            onSegment: (note, grid) => { if (alive()) { setSegNote(note); setSegGrid(grid); } },
            onFindings: (v, cr, rj, rc) => { if (alive()) { setFindings(v); setCrops(cr); setRejected(rj); setRejCrops(rc); } },
            onSynth: (s) => { if (alive()) setSynth(s); },
          },
        }
      );
      if (!alive()) return;
      refs.current.rectCanvas = res.rect;
      refs.current.quad = res.quad; setQuad(res.quad);
      setProv(res.provenance);
      setSegNote("");
    } catch (e) {
      console.error(e); setErrMsg("Pipeline error — try a clearer photo.");
    } finally {
      if (refs.current.runId === runId) { setRunning(false); if (refs.current.timer) clearInterval(refs.current.timer); setSegNote(""); }
    }
  };

  // ---- dragging ----
  const startDrag = (k: string) => (e: React.PointerEvent) => {
    e.preventDefault(); refs.current.dragging = k;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onViewerMove = (e: React.PointerEvent) => {
    const k = refs.current.dragging; if (!k || !refs.current.viewer) return;
    const r = refs.current.viewer.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
    if (k.startsWith("in_")) {
      const q = refs.current.quad; if (!q || !refs.current.inner) return;
      const cs = invBl(q, { x, y }); if (!cs) return;
      const inner = { ...refs.current.inner };
      if (k === "in_l") inner.l = Math.max(0.004, Math.min(0.3, cs.u));
      if (k === "in_r") inner.r = Math.max(0.7, Math.min(0.996, cs.u));
      if (k === "in_t") inner.t = Math.max(0.004, Math.min(0.3, cs.v));
      if (k === "in_b") inner.b = Math.max(0.7, Math.min(0.996, cs.v));
      applyInner(inner, "manual");
    } else {
      setQuad((p) => { const n = { ...(p as Quad), [k]: { x, y } }; refs.current.quad = n; return n; });
    }
  };
  const onViewerUp = () => {
    const k = refs.current.dragging; if (!k) return;
    refs.current.dragging = null;
    if (!k.startsWith("in_") && refs.current.quad) recomputeLocal(refs.current.quad);
  };
  const enterAdjust = () => {
    if (!refs.current.inner) applyInner({ l: 0.035, r: 0.965, t: 0.035, b: 0.965 }, "manual");
    setAdjust((a) => !a);
  };
  const copyListing = async () => {
    if (!synth) return;
    const text = `${synth.listingTitle || ""}\n\n${synth.listingBlurb || ""}\n\nCentering (measured): ${centerF && centerF.measured ? `${centerF.lr} · ${centerF.tb}` : "n/a"}${centerB && centerB.measured ? ` · Back ${centerB.lr}` : ""}`;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch { setErrMsg("Copy blocked — long-press the text to copy manually."); }
  };
  const genSlab = async () => {
    if (!synth || !refs.current.rectCanvas || slabBusy) return;
    setSlabBusy(true);
    try {
      const url = await makeSlab(cf, refs.current.rectCanvas, {
        name: cardId ? cardId.name : "Card",
        set: cardId ? cardId.set : "", number: cardId ? String(cardId.number ?? "") : "",
        grade10: synth.grade10, score1000: synth.score1000,
        condition: CONDITION[synth.grade10] || "",
        cert: `J1M-${Date.now().toString(36).toUpperCase().slice(-6)}`,
      }, { logoSrc: LOGO_URL, yellow: T.yellow, cream: T.cream, mono: MONO, grot: GROT });
      setSlabUrl(url);
    } catch (e) { console.error(e); setErrMsg("Slab render failed."); }
    setSlabBusy(false);
  };

  const dingSet = new Set<number>((synth && synth.dingIdx) || []);

  // overlay geometry
  const inner = centerF && centerF.inner;
  const cornerNb: Record<string, [string, string]> = { tl: ["tr", "bl"], tr: ["tl", "br"], br: ["bl", "tr"], bl: ["br", "tl"] };
  const bracket = (k: string) => cornerNb[k].map((nk) => {
    const p = (quad as Quad)[k as keyof Quad], n = (quad as Quad)[nk as keyof Quad];
    const dx = n.x - p.x, dy = n.y - p.y, len = Math.hypot(dx, dy) || 1;
    return { x2: p.x + (dx / len) * 7, y2: p.y + (dy / len) * 7 };
  });
  const edgeEnds: Record<string, [string, string]> = { top: ["tl", "tr"], right: ["tr", "br"], bottom: ["bl", "br"], left: ["tl", "bl"] };
  const edgeLine = (k: string) => {
    const [a, b] = edgeEnds[k].map((kk) => (quad as Quad)[kk as keyof Quad]);
    return { x1: a.x + (b.x - a.x) * 0.14, y1: a.y + (b.y - a.y) * 0.14, x2: a.x + (b.x - a.x) * 0.86, y2: a.y + (b.y - a.y) * 0.86 };
  };
  const polyOf = (u0: number, v0: number, u1: number, v1: number) =>
    [bl(quad as Quad, u0, v0), bl(quad as Quad, u1, v0), bl(quad as Quad, u1, v1), bl(quad as Quad, u0, v1)].map((p) => `${p.x},${p.y}`).join(" ");
  const midTop = quad ? bl(quad, 0.5, 0.035) : null;
  const midLeft = quad ? bl(quad, 0.05, 0.5) : null;
  const innerHandles: [string, { x: number; y: number }][] = quad && inner ? [
    ["in_l", bl(quad, inner.l, 0.5)], ["in_r", bl(quad, inner.r, 0.5)],
    ["in_t", bl(quad, 0.5, inner.t)], ["in_b", bl(quad, 0.5, inner.b)],
  ] : [];

  return (
    <div style={{ minHeight: "100vh", background: T.bed, color: T.text, fontFamily: GROT }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        @keyframes pulse { 0%,100% { opacity:.5; } 50% { opacity:1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
        button:focus-visible, label:focus-within, input:focus-visible { outline: 2px solid ${T.cyan}; outline-offset: 2px; }
        input[type=range] { accent-color: ${T.cyan}; }
      `}</style>

      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: `1px solid ${T.line}` }}>
        <img src={LOGO_URL} alt="J1m's Grading logo" style={{ width: 38, height: 38, borderRadius: 9, border: `1px solid ${T.line}` }} />
        <div>
          <div style={{ fontWeight: 700, letterSpacing: "0.06em", fontSize: 16 }}>J1M'S <span style={{ color: T.yellow }}>GRADING</span></div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: T.muted, letterSpacing: "0.14em" }}>VALOR PREGRADE ENGINE · v0.8</div>
        </div>
      </header>

      <main style={{ display: "flex", flexWrap: "wrap", gap: 18, padding: 18, maxWidth: 1100, margin: "0 auto" }}>
        {/* ===== viewer ===== */}
        <section style={{ flex: "1 1 340px", minWidth: 300 }}>
          {!front && (
            <p style={{ fontSize: 13, color: T.muted, marginBottom: 12, lineHeight: 1.5 }}>
              Raw card, flat, even light. Back unlocks back centering + crease cross-check. The angle shot — tilt the card so light glares across the surface — is the best evidence for dents and bends.
            </p>
          )}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <UploadSlot label="Front" sub="Required" img={front} onPick={(f) => pick(f, "front")} />
            <UploadSlot label="Back" sub="Centering + creases" img={back} onPick={(f) => pick(f, "back")} />
            <UploadSlot label="Angle shot" sub="Glare reveals dents" img={rake} onPick={(f) => pick(f, "rake")} />
          </div>

          {front && (
            <div ref={(el) => { refs.current.viewer = el; }} onPointerMove={onViewerMove} onPointerUp={onViewerUp}
              style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: `1px solid ${T.line}`, background: "#000", touchAction: adjust ? "none" : "auto" }}>
              <img src={front.dataUrl} alt="Card front" style={{ width: "100%", display: "block" }} draggable={false} />

              {reliefUrl && vision > 0 && quad && (
                <img src={reliefUrl} alt="Relief" style={{
                  position: "absolute", left: `${quad.tl.x}%`, top: `${quad.tl.y}%`,
                  width: `${quad.tr.x - quad.tl.x}%`, height: `${quad.bl.y - quad.tl.y}%`,
                  opacity: vision / 100, objectFit: "fill",
                }} />
              )}

              {quad && (
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
                  {layers.heatmap && segGrid && segGrid.scores.map((s, i) => (
                    s.score != null ? (
                      <polygon key={"hm" + i}
                        points={polyOf(s.col / segGrid.cols, s.row / segGrid.rows, (s.col + 1) / segGrid.cols, (s.row + 1) / segGrid.rows)}
                        fill={scoreColor(s.score)} opacity="0.26" stroke="#0B0E14" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                    ) : null
                  ))}
                  <polygon points={`${quad.tl.x},${quad.tl.y} ${quad.tr.x},${quad.tr.y} ${quad.br.x},${quad.br.y} ${quad.bl.x},${quad.bl.y}`}
                    fill="none" stroke={adjust ? T.yellow : T.good} strokeWidth="1.5" strokeDasharray="5 3" opacity="0.9" vectorEffect="non-scaling-stroke" />
                  {layers.centering && inner && (
                    <polygon points={polyOf(inner.l, inner.t, inner.r, inner.b)}
                      fill="none" stroke={T.cyan} strokeWidth="1.5" opacity="0.9" vectorEffect="non-scaling-stroke" />
                  )}
                  {layers.edges && edges && Object.entries(edges).map(([k, v]) => {
                    const l = edgeLine(k);
                    return <line key={k} {...l} stroke={scoreColor(v ? v.score : 0)} strokeWidth="4" opacity="0.85" vectorEffect="non-scaling-stroke" />;
                  })}
                  {layers.corners && corners && Object.entries(corners).map(([k, v]) =>
                    bracket(k).map((s, i) => (
                      <line key={k + i} x1={(quad as Quad)[k as keyof Quad].x} y1={(quad as Quad)[k as keyof Quad].y} x2={s.x2} y2={s.y2}
                        stroke={scoreColor(v ? v.score : 0)} strokeWidth="4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    )))}
                  {layers.dings && findings.map((d, i) => (
                    <polygon key={i} points={polyOf((d.u ?? 0) / 100, (d.v ?? 0) / 100, ((d.u ?? 0) + (d.w ?? 0)) / 100, ((d.v ?? 0) + (d.h ?? 0)) / 100)}
                      fill={focusIdx === i ? `${sevColor(d.severity || "")}33` : "transparent"}
                      stroke={sevColor(d.severity || "")} strokeWidth={dingSet.has(i) ? 3 : 1.5}
                      strokeDasharray={d.verdict === "uncertain" || !dingSet.has(i) ? "3 3" : ""}
                      vectorEffect="non-scaling-stroke"
                      style={{ cursor: "pointer", animation: focusIdx === i ? "pulse .9s ease-in-out infinite" : "none" }}
                      onClick={() => setFocusIdx(focusIdx === i ? null : i)} />
                  ))}
                </svg>
              )}

              {quad && layers.centering && centerF && centerF.measured && midTop && midLeft && (<>
                <span style={{ position: "absolute", left: `${midTop.x}%`, top: `${midTop.y}%`, transform: "translate(-50%,-50%)", fontFamily: MONO, fontSize: 10, color: T.cyan, background: "#000C", padding: "1px 6px", borderRadius: 3, pointerEvents: "none" }}>{centerF.lr}</span>
                <span style={{ position: "absolute", left: `${midLeft.x}%`, top: `${midLeft.y}%`, transform: "translate(-50%,-50%) rotate(-90deg)", fontFamily: MONO, fontSize: 10, color: T.cyan, background: "#000C", padding: "1px 6px", borderRadius: 3, pointerEvents: "none" }}>{centerF.tb}</span>
              </>)}

              {adjust && quad && (["tl", "tr", "br", "bl"] as const).map((k) => (
                <div key={k} onPointerDown={startDrag(k)}
                  style={{ position: "absolute", left: `${quad[k].x}%`, top: `${quad[k].y}%`, transform: "translate(-50%,-50%)", width: 26, height: 26, borderRadius: 999, border: `2px solid ${T.yellow}`, background: "#FFD23F33", cursor: "grab", touchAction: "none" }} />
              ))}
              {adjust && innerHandles.map(([k, p]) => (
                <div key={k} onPointerDown={startDrag(k)}
                  style={{ position: "absolute", left: `${p.x}%`, top: `${p.y}%`, transform: "translate(-50%,-50%)", width: 22, height: 22, borderRadius: 5, border: `2px solid ${T.cyan}`, background: "#4FD8E833", cursor: "grab", touchAction: "none" }} />
              ))}
            </div>
          )}

          {front && (<>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: T.muted, letterSpacing: "0.1em", whiteSpace: "nowrap" }}>RELIEF</span>
              <input type="range" min="0" max="100" value={vision} onChange={(e) => setVision(+e.target.value)} style={{ flex: 1 }} disabled={!reliefUrl} aria-label="Relief overlay opacity" />
              <button onClick={enterAdjust} disabled={!quad}
                style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12, fontFamily: GROT, border: `1px solid ${adjust ? T.yellow : T.line}`, background: adjust ? "#FFD23F1A" : "transparent", color: adjust ? T.yellow : T.muted, cursor: quad ? "pointer" : "default", opacity: quad ? 1 : 0.45 }}>
                {adjust ? "Done adjusting" : "Adjust lines"}
              </button>
            </div>
            {detecting && <p style={{ fontSize: 11, color: T.cyan, fontFamily: MONO, marginTop: 6 }}>Locating card edges…</p>}
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              {([["dings", "Dings"], ["corners", "Corners"], ["edges", "Edges"], ["centering", "Centering"], ["heatmap", "Heatmap"]] as const).map(([k, lbl]) => (
                <button key={k} onClick={() => setLayers((p) => ({ ...p, [k]: !p[k] }))}
                  style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12, fontFamily: GROT, border: `1px solid ${layers[k] ? T.cyan : T.line}`, background: layers[k] ? "#4FD8E81A" : "transparent", color: layers[k] ? T.cyan : T.muted, cursor: "pointer" }}>{lbl}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              {([["standard", "Standard · 2×2 · ~4 min"], ["deep", "Deep · 3×4 · ~10–15 min"]] as const).map(([k, lbl]) => (
                <button key={k} onClick={() => !running && setDepth(k)} disabled={running}
                  style={{ flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 11.5, fontFamily: GROT, border: `1px solid ${depth === k ? T.brand : T.line}`, background: depth === k ? "#1F9D4D22" : "transparent", color: depth === k ? T.good : T.muted, cursor: running ? "default" : "pointer" }}>{lbl}</button>
              ))}
            </div>
            <button onClick={run} disabled={running}
              style={{ marginTop: 10, width: "100%", padding: "13px 0", borderRadius: 10, border: "none", background: running ? T.line : T.brand, color: "#fff", fontWeight: 700, fontSize: 14, letterSpacing: "0.04em", fontFamily: GROT, cursor: running ? "wait" : "pointer" }}>
              {running ? `Analyzing… ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}` : synth ? "Re-run full analysis" : depth === "deep" ? "Run deep pre-grade (12 segments)" : "Run standard pre-grade"}
            </button>
          </>)}

          {front && Object.keys(stage).length > 0 && (
            <div style={{ marginTop: 12, background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 12px" }}>
              {STAGE_KEYS.map((k) => {
                const s = stage[k];
                return (
                  <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12, color: s ? T.text : T.muted }}>
                    {s === "done" ? <span style={{ color: T.good, fontFamily: MONO }}>✓</span>
                      : s === "fail" ? <span style={{ color: T.bad, fontFamily: MONO }}>✕</span>
                        : s === "active" ? <span style={{ width: 10, height: 10, border: `2px solid ${T.cyan}`, borderTopColor: "transparent", borderRadius: 999, display: "inline-block", animation: "spin .8s linear infinite" }} />
                          : <span style={{ color: T.line, fontFamily: MONO }}>·</span>}
                    {STAGE_LABELS[k]}
                  </div>
                );
              })}
              {segNote && <p style={{ fontSize: 11, color: T.cyan, fontFamily: MONO, margin: "6px 0 0" }}>{segNote}</p>}
            </div>
          )}
          {errMsg && <p style={{ color: T.bad, fontSize: 13, marginTop: 10 }}>{errMsg}</p>}
        </section>

        {/* ===== report ===== */}
        {(centerF || synth || corners) && (
          <section style={{ flex: "1 1 320px", minWidth: 300 }}>
            {synth && (
              <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: T.muted, letterSpacing: "0.12em", marginBottom: 4 }}>
                  {cardId ? `${(cardId.set || "").toUpperCase()} · ${cardId.number || "—"}${cardId.texturedFoil ? " · TEXTURED" : ""}${cardId.frame === "fullart" ? " · FULL ART" : ""}` : "CARD"}
                </div>
                <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 12 }}>{cardId ? cardId.name : "Card"}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: MONO, fontSize: 36, fontWeight: 600, color: T.yellow }}>{synth.score1000}</span>
                  <span style={{ fontFamily: MONO, fontSize: 18 }}>{synth.grade10}</span>
                  <span style={{ fontSize: 11, letterSpacing: "0.1em", color: T.muted }}>{CONDITION[synth.grade10] || ""}</span>
                  {synth.fallback && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, border: `1px solid ${T.warn}`, color: T.warn, fontFamily: MONO }}>ENGINE FALLBACK</span>}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                  {([["TAG", synth.grade10], ["PSA", synth.companyGrades && synth.companyGrades.psa], ["CGC", synth.companyGrades && synth.companyGrades.cgc]] as const).map(([c, g]) => (
                    <span key={c} style={{ fontFamily: MONO, fontSize: 11, padding: "3px 9px", borderRadius: 999, border: `1px solid ${T.line}`, color: T.text }}>
                      {c} <span style={{ color: scoreColor(g ?? 0) }}>{g ?? "—"}</span>
                    </span>
                  ))}
                  <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, border: `1px solid ${T.line}`, color: T.muted }}>range {synth.low}–{synth.high} · {synth.confidence}</span>
                </div>
                {synth.subgrades && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 12 }}>
                    {([["CTR", synth.subgrades.centering], ["CRN", synth.subgrades.corners], ["EDG", synth.subgrades.edges], ["SRF", synth.subgrades.surface]] as const).map(([t, v]) => (
                      <div key={t} style={{ background: T.panel2, borderRadius: 8, padding: "6px 4px", textAlign: "center" }}>
                        <div style={{ fontSize: 9, letterSpacing: "0.1em", color: T.muted }}>{t}</div>
                        <div style={{ fontFamily: MONO, fontSize: 14, color: scoreColor(v ?? 0) }}>{v ?? "—"}</div>
                      </div>
                    ))}
                  </div>
                )}
                {(synth.blockers || []).length > 0 && <div style={{ marginTop: 10, fontSize: 12, color: T.warn }}>Grade caps: {synth.blockers.join(" · ")}</div>}
                <p style={{ marginTop: 12, fontSize: 13, lineHeight: 1.55 }}>{synth.verdict}</p>

                {prov && (
                  <div style={{ marginTop: 12, borderTop: `1px solid ${T.line}`, paddingTop: 10 }}>
                    <button onClick={() => setShowProv((v) => !v)}
                      style={{ background: "transparent", border: "none", color: T.muted, fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", cursor: "pointer", padding: 0 }}>
                      {showProv ? "▾" : "▸"} PROVENANCE · ${prov.costUSD.toFixed(4)}/grade
                    </button>
                    {showProv && (
                      <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 10, color: T.muted, lineHeight: 1.7 }}>
                        <div>pipeline {prov.pipelineVersion} · calibration {prov.calibrationVersion} · {prov.depth}</div>
                        <div>prompts: {Object.entries(prov.promptVersions).map(([n, v]) => `${n}@${v}`).join("  ")}</div>
                        <div>cost/grade: ${prov.costUSD.toFixed(5)} · {prov.calls.length} calls · {prov.calls.filter((cc) => cc.cached).length} cached</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* surface map */}
            {segGrid && segGrid.scores.length > 0 && (
              <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: T.muted, marginBottom: 10 }}>
                  SURFACE MAP — {segGrid.cols}×{segGrid.rows} SEGMENT SWEEP
                </div>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${segGrid.cols}, 1fr)`, gap: 5 }}>
                  {Array.from({ length: segGrid.cols * segGrid.rows }).map((_, idx) => {
                    const col = idx % segGrid.cols, row = Math.floor(idx / segGrid.cols);
                    const s = segGrid.scores.find((q) => q.col === col && q.row === row);
                    return (
                      <div key={idx} title={s ? s.label : ""} style={{ aspectRatio: "1.05", borderRadius: 7, background: s && s.score != null ? scoreColor(s.score) + "33" : T.panel2, border: `1px solid ${s && s.score != null ? scoreColor(s.score) + "66" : T.line}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontFamily: MONO, fontSize: 13, color: s && s.score != null ? scoreColor(s.score) : T.muted }}>{s && s.score != null ? s.score : "·"}</span>
                      </div>
                    );
                  })}
                </div>
                <p style={{ fontSize: 10.5, color: T.muted, marginTop: 8 }}>Per-segment cleanliness from the deep sweep — toggle Heatmap on the photo to see it in place.</p>
              </div>
            )}

            {/* slab */}
            {synth && (
              <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: slabUrl ? 10 : 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: T.muted }}>J1M'S SLAB</span>
                  <button onClick={genSlab} disabled={slabBusy}
                    style={{ padding: "6px 14px", borderRadius: 999, fontSize: 12, fontFamily: GROT, border: "none", background: T.brand, color: "#fff", fontWeight: 700, cursor: slabBusy ? "wait" : "pointer" }}>
                    {slabBusy ? "Rendering…" : slabUrl ? "Re-generate" : "Generate slab"}
                  </button>
                </div>
                {slabUrl && (<>
                  <img src={slabUrl} alt="J1m's Grading slab preview" style={{ width: "100%", borderRadius: 10, display: "block" }} />
                  <div style={{ display: "flex", gap: 10, marginTop: 8, alignItems: "center" }}>
                    <a href={slabUrl} download="j1ms-grading-slab.png"
                      style={{ fontSize: 12, fontFamily: GROT, color: T.yellow, textDecoration: "none", border: `1px solid ${T.line}`, padding: "6px 12px", borderRadius: 999 }}>
                      Download PNG
                    </a>
                    <span style={{ fontSize: 10.5, color: T.muted }}>or long-press the image to save</span>
                  </div>
                </>)}
              </div>
            )}

            {synth && (synth.listingTitle || synth.listingBlurb) && (
              <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: T.muted }}>LISTING DRAFT</span>
                  <button onClick={copyListing}
                    style={{ padding: "5px 12px", borderRadius: 999, fontSize: 11, fontFamily: GROT, border: `1px solid ${copied ? T.good : T.line}`, background: "transparent", color: copied ? T.good : T.cyan, cursor: "pointer" }}>
                    {copied ? "Copied ✓" : "Copy listing"}
                  </button>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{synth.listingTitle}</div>
                <p style={{ fontSize: 12, color: T.muted, lineHeight: 1.55 }}>{synth.listingBlurb}</p>
              </div>
            )}

            <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: T.muted }}>CENTERING</span>
                {centerF && (
                  <span style={{ fontFamily: MONO, fontSize: 9, padding: "2px 7px", borderRadius: 999, border: `1px solid ${centerF.measured ? T.good : T.warn}`, color: centerF.measured ? T.good : T.warn }}>
                    {centerF.measured ? (centerF.source === "manual" ? "MEASURED · MANUAL" : "MEASURED · CV") : "NO FRAME LOCK"}
                  </span>
                )}
              </div>
              {centerF && centerF.measured ? (<>
                <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
                  <span style={{ fontFamily: MONO, fontSize: 16 }}>{centerF.lr}</span>
                  <span style={{ fontFamily: MONO, fontSize: 16 }}>{centerF.tb}</span>
                </div>
                <BorderBars c={centerF} />
                <div style={{ marginTop: 10, fontSize: 11, color: T.muted }}>
                  TAG ladder: grade <span style={{ fontFamily: MONO, color: scoreColor(gradeFromFrontCentering(centerF.worst) ?? 0) }}>{gradeFromFrontCentering(centerF.worst)}</span>
                  <span> · PSA cap </span><span style={{ fontFamily: MONO, color: (psaFrontCap(centerF.worst) ?? 0) >= 10 ? T.good : T.warn }}>PSA {psaFrontCap(centerF.worst)}</span>
                  <span> (worst axis governs)</span>
                </div>
                {centerB && centerB.measured && (
                  <div style={{ marginTop: 8, fontSize: 11, color: T.muted, borderTop: `1px solid ${T.line}`, paddingTop: 8 }}>
                    Back (measured): <span style={{ fontFamily: MONO, color: T.text }}>{centerB.lr} · {centerB.tb}</span> → back centering grade {gradeFromBackCenteringTCG(centerB.worst)}
                  </div>
                )}
              </>) : centerF ? (
                <p style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
                  No solid frame transition found. Tap Adjust lines to place the centering lines by hand, or add a back photo — the back frame is always measurable.
                </p>
              ) : <p style={{ fontSize: 12, color: T.muted }}>Upload a front to measure.</p>}
            </div>

            {(findings.length > 0 || rejected.length > 0 || stage.verify) && (
              <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: T.muted, marginBottom: 2 }}>DEFECTS OF NOTABLE GRADE SIGNIFICANCE</div>
                <div style={{ fontSize: 11, color: T.muted, marginBottom: 12 }}>
                  Color + relief evidence for every finding. Solid = verified DING gating the grade. Dashed = noted/uncertain.
                </div>
                {findings.length === 0 && <p style={{ fontSize: 12, color: T.muted, marginBottom: rejected.length ? 12 : 0 }}>No verified defects on this card.</p>}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
                  {findings.map((d, i) => (
                    <button key={i} onClick={() => setFocusIdx(focusIdx === i ? null : i)}
                      style={{ background: T.panel2, border: `1px solid ${focusIdx === i ? sevColor(d.severity || "") : dingSet.has(i) ? sevColor(d.severity || "") + "88" : T.line}`, borderRadius: 10, padding: 8, cursor: "pointer", color: T.text, fontFamily: GROT, textAlign: "left" }}>
                      {crops[i] ? (
                        <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                          <img src={crops[i].color} alt={`${d.type} color zoom`} style={{ width: "50%", borderRadius: 6, display: "block" }} />
                          <img src={crops[i].relief} alt={`${d.type} relief zoom`} style={{ width: "50%", borderRadius: 6, display: "block" }} />
                        </div>
                      ) : <div style={{ width: "100%", aspectRatio: "2", borderRadius: 6, background: T.line, marginBottom: 6 }} />}
                      <div style={{ fontFamily: MONO, fontSize: 9, color: T.muted, letterSpacing: "0.06em" }}>
                        FRONT / {(d.loc || "").toUpperCase()}{dingSet.has(i) ? " · DING" : d.verdict === "uncertain" ? " · UNCERTAIN" : ""}{d.onBack ? " · SHOWS ON BACK" : ""}
                      </div>
                      <div style={{ fontSize: 11.5, marginTop: 2 }}>{d.type}</div>
                      <div style={{ fontFamily: MONO, fontSize: 9.5, color: sevColor(d.severity || ""), marginTop: 2 }}>{d.severity}</div>
                    </button>
                  ))}
                </div>
                {rejected.length > 0 && (<>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: T.muted, margin: "14px 0 8px" }}>
                    EXAMINED &amp; CLEARED ({rejected.length}) — re-checked at magnification, ruled artwork/texture
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8, opacity: 0.62 }}>
                    {rejected.map((d, i) => (
                      <div key={i} style={{ background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 10, padding: 6 }}>
                        {rejCrops[i] && (
                          <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
                            <img src={rejCrops[i].color} alt="cleared color zoom" style={{ width: "50%", borderRadius: 5, display: "block" }} />
                            <img src={rejCrops[i].relief} alt="cleared relief zoom" style={{ width: "50%", borderRadius: 5, display: "block" }} />
                          </div>
                        )}
                        <div style={{ fontFamily: MONO, fontSize: 8.5, color: T.muted }}>{(d.loc || "").toUpperCase()} · {d.vnote || "artwork"}</div>
                      </div>
                    ))}
                  </div>
                </>)}
              </div>
            )}

            {(corners || edges) && (
              <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: T.muted, marginBottom: 10 }}>CORNERS &amp; EDGES — ZOOMED PASSES</div>
                {corners && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                    {(["tl", "tr", "bl", "br"] as const).map((k) => (
                      <div key={k} style={{ background: T.panel2, borderRadius: 8, padding: "8px 10px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                          <span style={{ color: T.muted }}>{k.toUpperCase()}</span><Pill value={corners[k] ? corners[k]!.score : 0} />
                        </div>
                        <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{corners[k] ? corners[k]!.note : ""}</div>
                      </div>
                    ))}
                  </div>
                )}
                {edges && (["top", "right", "bottom", "left"] as const).map((k) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderTop: `1px solid ${T.line}` }}>
                    <span style={{ color: T.muted }}>{k} edge — {edges[k] ? edges[k]!.note : ""}</span>
                    <Pill value={edges[k] ? edges[k]!.score : 0} />
                  </div>
                ))}
                <p style={{ fontSize: 10.5, color: T.muted, marginTop: 12, lineHeight: 1.5 }}>
                  TAG-rubric scoring with deterministic engine baseline; centering geometrically measured. Calibration honesty: leading AI pre-graders land within ±1 grade of PSA ~85–95% of the time, and PSA agrees with its own regrades only ~80–85% — read the range, not the point. Pre-grade for submit/trade triage, not an official grade.
                </p>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
