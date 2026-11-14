// Geometría FIBA de media cancha. Coordenadas normalizadas:
// x: 0..1 sobre 15 m de ancho; y: 0..1 sobre 14 m desde la línea de fondo (canasta arriba).

export const COURT_W = 15;
export const COURT_H = 14;
export const RIM = { x: 7.5, y: 1.575 };
export const THREE_R = 6.75;
export const CORNER_X = 6.6; // distancia lateral de la línea de 3 en las esquinas
export const CORNER_Y = RIM.y + Math.sqrt(THREE_R * THREE_R - CORNER_X * CORNER_X); // ≈ 2.99 m
export const LANE_HALF = 2.45;
export const FT_LINE_Y = 5.8;

export type Zone =
  | "paint"
  | "mid_left"
  | "mid_center"
  | "mid_right"
  | "corner3_left"
  | "corner3_right"
  | "wing3_left"
  | "wing3_right"
  | "top3";

export const ZONES: Zone[] = [
  "paint",
  "mid_left",
  "mid_center",
  "mid_right",
  "corner3_left",
  "corner3_right",
  "wing3_left",
  "wing3_right",
  "top3",
];

export function toMeters(x: number, y: number) {
  return { X: x * COURT_W, Y: y * COURT_H };
}

/** ¿El punto (normalizado) está fuera de la línea de 3? */
export function isThree(x: number, y: number): boolean {
  const { X, Y } = toMeters(x, y);
  const dx = X - RIM.x;
  if (Y <= CORNER_Y) return Math.abs(dx) >= CORNER_X;
  const dy = Y - RIM.y;
  return Math.sqrt(dx * dx + dy * dy) >= THREE_R;
}

export function zoneOf(x: number, y: number): Zone {
  const { X, Y } = toMeters(x, y);
  const dx = X - RIM.x;
  const dy = Math.max(Y - RIM.y, 0.0001);
  const angle = (Math.atan2(dx, dy) * 180) / Math.PI; // 0 = frente a la canasta
  const side = dx < 0 ? "left" : "right";
  if (isThree(x, y)) {
    if (Y <= CORNER_Y) return side === "left" ? "corner3_left" : "corner3_right";
    if (Math.abs(angle) <= 25) return "top3";
    return side === "left" ? "wing3_left" : "wing3_right";
  }
  if (Math.abs(dx) <= LANE_HALF && Y <= FT_LINE_Y) return "paint";
  if (Math.abs(angle) <= 25) return "mid_center";
  return side === "left" ? "mid_left" : "mid_right";
}

/** Punto representativo de cada zona (para etiquetas del mapa de calor). */
export const ZONE_CENTER: Record<Zone, { x: number; y: number }> = {
  paint: { x: 0.5, y: 0.22 },
  mid_left: { x: 0.2, y: 0.25 },
  mid_center: { x: 0.5, y: 0.5 },
  mid_right: { x: 0.8, y: 0.25 },
  corner3_left: { x: 0.03, y: 0.08 },
  corner3_right: { x: 0.97, y: 0.08 },
  wing3_left: { x: 0.12, y: 0.62 },
  wing3_right: { x: 0.88, y: 0.62 },
  top3: { x: 0.5, y: 0.82 },
};
