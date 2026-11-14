"use client";
import type { FlowPoint } from "@/lib/stats";

/** Evolución del marcador: diferencia (arriba = ganamos) con cortes de periodo. */
export function ScoreFlow({ flow, totalMs, periodMarks, usColor = "#ff6a13", themColor = "#2bb3ff", labels }: { flow: FlowPoint[]; totalMs: number; periodMarks: number[]; usColor?: string; themColor?: string; labels: { us: string; them: string } }) {
  const W = 600;
  const H = 180;
  const pad = { l: 28, r: 8, t: 10, b: 18 };
  const maxAbs = Math.max(5, ...flow.map((f) => Math.abs(f.us - f.them)));
  const x = (t: number) => pad.l + (t / Math.max(totalMs, 1)) * (W - pad.l - pad.r);
  const y = (d: number) => pad.t + ((maxAbs - d) / (2 * maxAbs)) * (H - pad.t - pad.b);
  // Escalonado
  let d = `M${x(0)} ${y(0)}`;
  let prev = 0;
  for (const f of flow.slice(1)) {
    d += ` L${x(f.t)} ${y(prev)} L${x(f.t)} ${y(f.us - f.them)}`;
    prev = f.us - f.them;
  }
  d += ` L${x(totalMs)} ${y(prev)}`;
  const area = `${d} L${x(totalMs)} ${y(0)} L${x(0)} ${y(0)} Z`;
  const mid = y(0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Evolución del marcador">
      <defs>
        <clipPath id="above">
          <rect x={0} y={0} width={W} height={mid} />
        </clipPath>
        <clipPath id="below">
          <rect x={0} y={mid} width={W} height={H - mid} />
        </clipPath>
      </defs>
      {periodMarks.map((m, i) => (
        <line key={i} x1={x(m)} x2={x(m)} y1={pad.t} y2={H - pad.b} stroke="var(--line)" strokeDasharray="3 3" />
      ))}
      <line x1={pad.l} x2={W - pad.r} y1={mid} y2={mid} stroke="var(--muted)" strokeWidth={0.8} />
      <path d={area} fill={usColor} opacity={0.3} clipPath="url(#above)" />
      <path d={area} fill={themColor} opacity={0.3} clipPath="url(#below)" />
      <path d={d} fill="none" stroke="var(--text)" strokeWidth={1.6} />
      <text x={4} y={pad.t + 8} fontSize={10} fill={usColor} fontWeight={800}>
        +{maxAbs}
      </text>
      <text x={4} y={H - pad.b} fontSize={10} fill={themColor} fontWeight={800}>
        −{maxAbs}
      </text>
      <text x={pad.l + 4} y={pad.t + 10} fontSize={10} fill="var(--muted)">
        {labels.us} ▲
      </text>
      <text x={pad.l + 4} y={H - pad.b - 4} fontSize={10} fill="var(--muted)">
        {labels.them} ▼
      </text>
    </svg>
  );
}

/** Barras enfrentadas para comparar dos equipos o dos jugadores. */
export function CompareRow({ label, a, b, fmt = (v: number) => String(v), higherIsBetter = true }: { label: string; a: number; b: number; fmt?: (v: number) => string; higherIsBetter?: boolean }) {
  const max = Math.max(Math.abs(a), Math.abs(b), 0.0001);
  const aw = (Math.abs(a) / max) * 100;
  const bw = (Math.abs(b) / max) * 100;
  const aBetter = Number.isFinite(a) && Number.isFinite(b) && (higherIsBetter ? a > b : a < b);
  const bBetter = Number.isFinite(a) && Number.isFinite(b) && (higherIsBetter ? b > a : b < a);
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm py-1">
      <div className="flex items-center gap-2 justify-end">
        <span className={`tabular-nums ${aBetter ? "font-black" : ""}`}>{fmt(a)}</span>
        <div className="h-2.5 rounded-full bg-brand" style={{ width: `${Number.isFinite(aw) ? aw * 0.6 : 0}%`, minWidth: 2 }} />
      </div>
      <div className="text-xs muted font-bold w-24 text-center">{label}</div>
      <div className="flex items-center gap-2">
        <div className="h-2.5 rounded-full bg-rival" style={{ width: `${Number.isFinite(bw) ? bw * 0.6 : 0}%`, minWidth: 2 }} />
        <span className={`tabular-nums ${bBetter ? "font-black" : ""}`}>{fmt(b)}</span>
      </div>
    </div>
  );
}
