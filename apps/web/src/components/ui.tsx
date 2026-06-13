// Small presentational components extracted from the v7 prototype (unchanged visuals).

import { MONO, GROT, T, scoreColor } from "../lib/brand.js";
import type { Centering } from "@j1m/cv";

export function BorderBars({ c }: { c: Centering | null }) {
  if (!c || !c.measured || !c.bordersPct) return null;
  const rows: [string, number][] = [
    ["L", c.bordersPct.l],
    ["R", c.bordersPct.r],
    ["T", c.bordersPct.t],
    ["B", c.bordersPct.b],
  ];
  const max = Math.max(...rows.map((r) => r[1]), 0.1);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "14px 1fr 44px", gap: "4px 8px", alignItems: "center" }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <span style={{ fontFamily: MONO, fontSize: 10, color: T.muted }}>{k}</span>
          <div style={{ height: 6, background: T.line, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${(v / max) * 100}%`, height: "100%", background: T.cyan, opacity: 0.85 }} />
          </div>
          <span style={{ fontFamily: MONO, fontSize: 10, color: T.text, textAlign: "right" }}>{v}%</span>
        </div>
      ))}
    </div>
  );
}

export const Pill = ({ value }: { value: number }) => (
  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: scoreColor(value) }}>
    {Number(value).toFixed(1)}
  </span>
);

export interface UploadImage {
  dataUrl: string;
}

export function UploadSlot({
  label,
  sub,
  img,
  onPick,
}: {
  label: string;
  sub: string;
  img: UploadImage | null;
  onPick: (f: File) => void;
}) {
  return (
    <label
      style={{
        flex: "1 1 30%", minWidth: 96, display: "block", padding: img ? 6 : "18px 8px", borderRadius: 10,
        cursor: "pointer", border: `1px dashed ${img ? T.brand : T.line}`, background: T.panel2, color: T.muted,
        fontSize: 11, fontFamily: GROT, textAlign: "center", position: "relative",
      }}
    >
      <input
        type="file"
        accept="image/*,.heic,.heif"
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden", clip: "rect(0 0 0 0)" }}
        onChange={(e) => {
          const f = e.target.files && e.target.files[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
      {img ? (
        <img src={img.dataUrl} alt={label} style={{ width: "100%", maxHeight: 90, objectFit: "contain", borderRadius: 6 }} />
      ) : (
        <>
          <div style={{ color: T.text, fontSize: 12, marginBottom: 2 }}>{label}</div>
          <div>{sub}</div>
        </>
      )}
    </label>
  );
}
