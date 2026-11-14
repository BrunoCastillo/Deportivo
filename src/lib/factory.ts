import { save, uid } from "./db";
import type { Club, DetailLevel, Drill, Game, GameFormat, Opponent, Player, Team } from "./types";

export const TEAM_COLORS = ["#ff6a13", "#2bb3ff", "#22c55e", "#eab308", "#a855f7", "#ef4444", "#14b8a6", "#f43f5e", "#e5e7eb"];

export async function createClub(name: string, city = "") {
  const id = uid();
  return save<Club>("clubs", { id, clubId: id, name: name.trim(), city, color: "#ff6a13" });
}

export async function createTeam(clubId: string, name: string, category: string, color = "#ff6a13", seasonId?: string) {
  return save<Team>("teams", { id: uid(), clubId, name: name.trim(), category: category.trim(), color, seasonId });
}

export async function createPlayer(p: Omit<Player, "id" | "createdAt" | "updatedAt">) {
  return save<Player>("players", { id: uid(), ...p });
}

export async function createOpponent(clubId: string, name: string, color = "#2bb3ff") {
  const short = name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
  return save<Opponent>("opponents", { id: uid(), clubId, name: name.trim(), shortName: short || "RIV", color, players: [] });
}

export function formatDefaults(format: GameFormat) {
  return format === "3x3"
    ? { periods: 1, periodMinutes: 10, otMinutes: 0 }
    : { periods: 4, periodMinutes: 10, otMinutes: 5 };
}

export async function createGame(g: {
  clubId: string;
  teamId: string;
  opponentId?: string;
  opponentName: string;
  date: string;
  format: GameFormat;
  detail: DetailLevel;
  periods?: number;
  periodMinutes?: number;
  otMinutes?: number;
  home?: boolean;
  venue?: string;
  competitionId?: string;
  seasonId?: string;
  rosterIds: string[];
}) {
  const d = formatDefaults(g.format);
  const periods = g.periods ?? d.periods;
  const periodMinutes = g.periodMinutes ?? d.periodMinutes;
  return save<Game>("games", {
    id: uid(),
    clubId: g.clubId,
    teamId: g.teamId,
    opponentId: g.opponentId,
    opponentName: g.opponentName,
    competitionId: g.competitionId,
    seasonId: g.seasonId,
    date: g.date,
    venue: g.venue,
    home: g.home ?? true,
    format: g.format,
    periods,
    periodMinutes,
    otMinutes: g.otMinutes ?? d.otMinutes,
    detail: g.detail,
    status: "scheduled",
    rosterIds: g.rosterIds,
    starterIds: [],
    clock: { period: 1, remainingMs: periodMinutes * 60000, running: false },
    publicLive: false,
  });
}

export const STARTER_DRILLS: Omit<Drill, "id" | "clubId" | "createdAt" | "updatedAt">[] = [
  { name: "Entrada en carrera 2 filas", category: "Calentamiento", minutes: 8, players: "Todos", description: "Dos filas desde medio campo, bandeja por derecha e izquierda, recoge el de la fila contraria." },
  { name: "Tiro de 5 posiciones", category: "Tiro", minutes: 10, players: "Parejas", description: "Esquina, ala, frente, ala, esquina. 5 tiros por posición, el compañero rebotea y pasa. Registrar convertidos." },
  { name: "Defensa en zig-zag", category: "Defensa", minutes: 8, players: "Parejas", description: "Atacante bota en zig-zag a lo largo de la cancha; defensor en desplazamiento lateral sin cruzar pies." },
  { name: "3 contra 2 / 2 contra 1", category: "Transición", minutes: 12, players: "Grupos de 5", description: "Tres atacan contra dos; los dos defensores salen al contraataque 2c1 contra el tirador." },
  { name: "Bloqueo directo lectura", category: "Táctica", minutes: 12, players: "4 vs 4", description: "Pick and roll central: lecturas de continuación, abrir y tiro tras bote según defensa." },
  { name: "Tiros libres bajo fatiga", category: "Tiro", minutes: 6, players: "Todos", description: "Sprint de ida y vuelta y 2 tiros libres. Quien falla suma una carrera al final." },
];
