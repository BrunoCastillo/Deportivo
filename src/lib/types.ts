// Modelo de datos de Rebote. Todas las entidades son documentos con id UUID,
// se guardan en IndexedDB (Dexie) y se sincronizan con Supabase (tabla `records`).

export type ID = string;

export type Role = "admin" | "coach" | "scorer" | "player" | "fan";

export interface BaseDoc {
  id: ID;
  clubId: ID;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

export interface Club extends BaseDoc {
  name: string;
  city?: string;
  color: string;
  /** Rol del usuario actual en el club (local; viene de club_members al sincronizar). */
  myRole?: Role;
}

export interface Season extends BaseDoc {
  name: string;
  startDate?: string;
  endDate?: string;
}

export interface Team extends BaseDoc {
  name: string;
  category: string; // Sub-14, Sub-16, Mayores, etc.
  gender?: "M" | "F" | "X";
  seasonId?: ID;
  color: string;
}

export type Position = "PG" | "SG" | "SF" | "PF" | "C" | "";
export type PlayerStatus = "active" | "injured" | "inactive";

export interface Player extends BaseDoc {
  teamId: ID;
  firstName: string;
  lastName: string;
  number: string;
  position: Position;
  status: PlayerStatus;
  photo?: string; // dataURL reducido (máx ~160px)
  birthYear?: number;
}

export interface OpponentPlayer {
  id: ID;
  number: string;
  name?: string;
}

export interface Opponent extends BaseDoc {
  name: string;
  shortName: string;
  color: string;
  players: OpponentPlayer[];
}

export interface Competition extends BaseDoc {
  name: string;
  kind: "league" | "tournament" | "friendly";
  seasonId?: ID;
}

export type GameFormat = "5x5" | "3x3";
export type DetailLevel = "basic" | "advanced" | "pro";
export type GameStatus = "scheduled" | "live" | "final";

export interface ClockState {
  period: number; // 1..n, >n = prórrogas
  remainingMs: number;
  running: boolean;
  /** Date.now() cuando se arrancó por última vez (si running) */
  startedAt?: number;
}

export interface Game extends BaseDoc {
  teamId: ID;
  opponentId?: ID;
  opponentName: string;
  competitionId?: ID;
  seasonId?: ID;
  date: string; // ISO yyyy-mm-ddThh:mm
  venue?: string;
  home: boolean;
  format: GameFormat;
  periods: number;
  periodMinutes: number;
  otMinutes: number;
  detail: DetailLevel;
  status: GameStatus;
  rosterIds: ID[]; // jugadores convocados
  starterIds: ID[];
  clock: ClockState;
  publicLive: boolean;
  notes?: string;
}

export type TeamSide = "us" | "them";

export type EventType =
  | "shot2"
  | "shot3"
  | "ft"
  | "oreb"
  | "dreb"
  | "teamreb" // rebote de equipo (sin jugador)
  | "ast"
  | "stl"
  | "blk"
  | "tov"
  | "tov_forced" // pérdida forzada (crédito defensivo, ej. falta en ataque provocada)
  | "foul" // falta personal
  | "foul_tech"
  | "foul_unsp" // antideportiva
  | "foul_drawn" // falta recibida
  | "sub" // cambio: playerId entra, outId sale
  | "timeout"
  | "period_end";

export type TovKind = "travel" | "double" | "bad_pass" | "lost_ball" | "offensive_foul" | "violation" | "other";

export interface GameEvent extends BaseDoc {
  gameId: ID;
  team: TeamSide;
  type: EventType;
  playerId?: ID; // jugador propio o del rival (OpponentPlayer.id)
  outId?: ID; // para cambios
  period: number;
  clockMs: number; // tiempo restante en el periodo
  made?: boolean;
  points?: number; // puntos que vale si es convertido (según formato)
  x?: number; // 0..1 ancho de cancha (media cancha, canasta arriba)
  y?: number; // 0..1 largo de media cancha desde la línea de fondo
  tov?: TovKind;
  parentId?: ID; // acción encadenada (asistencia/rebote/tiros de una falta)
  ftCount?: number; // tiros libres concedidos por una falta
  device?: string; // anotador que lo registró
  blockedBy?: boolean; // tiro taponado (para PIR: tapones recibidos)
}

export interface Drill extends BaseDoc {
  name: string;
  category: string; // tiro, defensa, transición...
  minutes: number;
  players?: string;
  description: string;
}

export interface TrainingItem {
  drillId: ID;
  minutes: number;
  notes?: string;
}

export interface Training extends BaseDoc {
  teamId: ID;
  date: string;
  minutes: number;
  focus: string;
  items: TrainingItem[];
  attendance: ID[];
  notes?: string;
}

export type TableName =
  | "clubs"
  | "seasons"
  | "teams"
  | "players"
  | "opponents"
  | "competitions"
  | "games"
  | "events"
  | "drills"
  | "trainings";

export const TABLES: TableName[] = [
  "clubs",
  "seasons",
  "teams",
  "players",
  "opponents",
  "competitions",
  "games",
  "events",
  "drills",
  "trainings",
];
