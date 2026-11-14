"use client";
import { useRef } from "react";
import type { ShotPoint } from "@/lib/stats";
import { zoneStats } from "@/lib/stats";
import { ZONE_CENTER, ZONES, type Zone, isThree, zoneOf } from "@/lib/court";

// Media cancha en decímetros: 150 x 140, canasta arriba.
const W = 150;
const H = 140;

/** Polígonos aproximados de cada zona para el mapa de calor (decímetros). */
function zonePath(z: Zone): string {
  // Construido muestreando la grilla: celdas de 5 dm que pertenecen a la zona.
  const cells: string[] = [];
  const step = 5;
  for (let x = 0; x < W; x += step) {
    for (let y = 0; y < H; y += step) {
      if (zoneOf((x + step / 2) / W, (y + step / 2) / H) === z) cells.push(`M${x} ${y}h${step}v${step}h-${step}z`);
    }
  }
  return cells.join("");
}
const ZONE_PATHS: Record<Zone, string> = Object.fromEntries(ZONES.map((z) => [z, zonePath(z)])) as Record<Zone, string>;

function heatColor(p: number) {
  // 0% azul frío → 50% amarillo → 70%+ naranja/rojo
  if (!Number.isFinite(p)) return "transparent";
  if (p < 0.25) return "#2563eb";
  if (p < 0.35) return "#38bdf8";
  if (p < 0.45) return "#facc15";
  if (p < 0.55) return "#fb923c";
  return "#ef4444";
}

export function CourtLines({ stroke = "currentColor" }: { stroke?: string }) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={0.8} opacity={0.75}>
      <rect x={0} y={0} width={W} height={H} />
      {/* zona */}
      <rect x={50.5} y={0} width={49} height={58} />
      <circle cx={75} cy={58} r={18} />
      {/* línea de 3 */}
      <path d="M9 0 L9 29.9 A67.5 67.5 0 0 0 141 29.9 L141 0" />
      {/* aro y tablero */}
      <line x1={66} y1={12} x2={84} y2={12} strokeWidth={1.4} />
      <circle cx={75} cy={15.75} r={2.25} />
      <path d="M62.5 12 L62.5 15.75 A12.5 12.5 0 0 0 87.5 15.75 L87.5 12" />
      {/* medio campo */}
      <path d={`M57 ${H} A18 18 0 0 1 93 ${H}`} />
    </g>
  );
}

export function Court({
  shots = [],
  onTap,
  heat = false,
  color = "#ff6a13",
  marker,
  className = "",
  label,
}: {
  shots?: ShotPoint[];
  onTap?: (x: number, y: number) => void;
  heat?: boolean;
  color?: string;
  marker?: { x: number; y: number } | null;
  className?: string;
  label?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const zs = heat ? zoneStats(shots) : null;

  const handle = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onTap || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    onTap(x, y);
  };

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      className={`w-full h-auto select-none touch-none rounded-xl ${onTap ? "cursor-crosshair" : ""} ${className}`}
      style={{ background: "var(--surface-2)", color: "var(--muted)" }}
      onPointerUp={handle}
      role={onTap ? "button" : "img"}
      aria-label={label ?? "Cancha"}
    >
      {zs &&
        ZONES.map((z) => {
          const s = zs[z];
          const p = s.att ? s.made / s.att : NaN;
          return <path key={z} d={ZONE_PATHS[z]} fill={heatColor(p)} opacity={s.att ? 0.55 : 0} />;
        })}
      <CourtLines />
      {zs &&
        ZONES.map((z) => {
          const s = zs[z];
          if (!s.att) return null;
          const c = ZONE_CENTER[z];
          return (
            <g key={z} transform={`translate(${c.x * W} ${c.y * H})`}>
              <rect x={-12} y={-7} width={24} height={14} rx={3} fill="rgba(0,0,0,.65)" />
              <text textAnchor="middle" y={-0.5} fontSize={5} fontWeight={800} fill="#fff">
                {s.made}/{s.att}
              </text>
              <text textAnchor="middle" y={5} fontSize={4} fill="#fff">
                {Math.round((s.made / s.att) * 100)}%
              </text>
            </g>
          );
        })}
      {!heat &&
        shots.map((s) => {
          const cx = s.x * W;
          const cy = s.y * H;
          return s.made ? (
            <circle key={s.id} cx={cx} cy={cy} r={2.6} fill={color} stroke="#000" strokeWidth={0.4} />
          ) : (
            <g key={s.id} stroke={s.team === "us" ? "#ef4444" : "#94a3b8"} strokeWidth={1.1}>
              <line x1={cx - 2.2} y1={cy - 2.2} x2={cx + 2.2} y2={cy + 2.2} />
              <line x1={cx + 2.2} y1={cy - 2.2} x2={cx - 2.2} y2={cy + 2.2} />
            </g>
          );
        })}
      {marker && (
        <g>
          <circle cx={marker.x * W} cy={marker.y * H} r={4} fill="none" stroke={color} strokeWidth={1.2} />
          <circle cx={marker.x * W} cy={marker.y * H} r={1.2} fill={color} />
          <text x={marker.x * W} y={marker.y * H - 6} textAnchor="middle" fontSize={6} fontWeight={900} fill={color}>
            {isThree(marker.x, marker.y) ? "3" : "2"}
          </text>
        </g>
      )}
    </svg>
  );
}
