// TAG-derived scoring tables + ladders + value snapping. Pure functions, no I/O.
// Ported verbatim from the prototype — numbers are load-bearing, do not "tune" here.

export const CONDITION: Record<number, string> = {
  10: "GEM MINT", 9: "MINT", 8.5: "NM-MT+", 8: "NM-MT", 7.5: "NM+", 7: "NM",
  6.5: "EX-MT+", 6: "EX-MT", 5.5: "EX+", 5: "EX", 4.5: "VG-EX+", 4: "VG-EX",
  3.5: "VG+", 3: "VG", 2.5: "GOOD+", 2: "GOOD", 1.5: "FAIR", 1: "POOR",
};

export const BAND: Record<number, [number, number]> = {
  10: [950, 989], 9: [900, 949], 8.5: [850, 899], 8: [800, 849], 7.5: [750, 799],
  7: [700, 749], 6.5: [650, 699], 6: [600, 649], 5.5: [550, 599], 5: [500, 549],
  4.5: [450, 499], 4: [400, 449], 3.5: [350, 399], 3: [300, 349], 2.5: [250, 299],
  2: [200, 249], 1.5: [150, 199], 1: [100, 149],
};

export function gradeFromFrontCentering(worst: number | null | undefined): number | null {
  if (worst == null) return null;
  const ladder: [number, number][] = [
    [55, 10], [60, 9], [62.5, 8.5], [65, 8], [67.5, 7.5], [70, 7], [72.5, 6.5],
    [75, 6], [77.5, 5.5], [80, 5], [82.5, 4.5], [85, 4], [87.5, 3.5], [90, 3],
    [92.5, 2.5], [95, 2],
  ];
  for (const [t, g] of ladder) if (worst <= t) return g;
  return 1.5;
}

export function gradeFromBackCenteringTCG(worst: number | null | undefined): number | null {
  if (worst == null) return null;
  return worst <= 65 ? 10 : worst <= 75 ? 9 : worst <= 85 ? 8.5 : worst <= 95 ? 8 : 7;
}

export function psaFrontCap(worst: number | null | undefined): number | null {
  return worst == null
    ? null
    : worst <= 55 ? 10 : worst <= 60 ? 9 : worst <= 65 ? 8 : worst <= 70 ? 7 : worst <= 75 ? 6 : 5;
}

export function toHalf(x: unknown): number | null {
  const n = Number(x);
  if (!isFinite(n) || n <= 0) return null;
  return Math.min(10, Math.max(1, Math.round(n * 2) / 2));
}
