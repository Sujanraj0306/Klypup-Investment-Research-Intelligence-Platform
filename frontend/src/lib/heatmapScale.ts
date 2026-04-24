/**
 * Map a daily % change to a treemap tile color. Discrete steps at the
 * breakpoints called out in the spec; values between steps are linearly
 * interpolated so the scale reads as continuous.
 */
const STOPS: Array<[number, string]> = [
  [-3, '#7F1D1D'],
  [-2, '#991B1B'],
  [-1, '#B91C1C'],
  [0, '#1C2333'],
  [1, '#064E3B'],
  [2, '#065F46'],
  [3, '#047857'],
];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.round(v).toString(16).padStart(2, '0'))
      .join('')
  );
}

export function colorForChange(changePct: number | null | undefined): string {
  if (changePct == null || Number.isNaN(changePct)) return '#1C2333';
  if (changePct <= STOPS[0][0]) return STOPS[0][1];
  if (changePct >= STOPS[STOPS.length - 1][0]) return STOPS[STOPS.length - 1][1];
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [xa, ca] = STOPS[i];
    const [xb, cb] = STOPS[i + 1];
    if (changePct >= xa && changePct <= xb) {
      const t = (changePct - xa) / (xb - xa);
      const a = hexToRgb(ca);
      const b = hexToRgb(cb);
      return rgbToHex([
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
      ]);
    }
  }
  return '#1C2333';
}

export const HEATMAP_LEGEND_STOPS = STOPS;
