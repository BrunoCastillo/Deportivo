// Motor de estadísticas: todo se deriva de la lista de eventos del partido (event sourcing).
// Así deshacer / editar / insertar acciones en cualquier minuto recalcula todo de forma consistente.
import type { Game, GameEvent, ID, TeamSide } from "./types";
import { zoneOf, type Zone, ZONES } from "./court";

export interface StatLine {
  pts: number;
  fgm2: number;
  fga2: number;
  fgm3: number;
  fga3: number;
  ftm: number;
  fta: number;
  oreb: number;
  dreb: number;
  ast: number;
  stl: number;
  blk: number;
  blka: number; // tapones recibidos
  tov: number;
  tovForced: number;
  pf: number; // faltas personales totales (incluye técnicas y antideportivas del jugador)
  tf: number;
  uf: number;
  fd: number; // faltas recibidas
  pm: number; // +/-
  secs: number; // segundos jugados
}

export const emptyLine = (): StatLine => ({
  pts: 0,
  fgm2: 0,
  fga2: 0,
  fgm3: 0,
  fga3: 0,
  ftm: 0,
  fta: 0,
  oreb: 0,
  dreb: 0,
  ast: 0,
  stl: 0,
  blk: 0,
  blka: 0,
  tov: 0,
  tovForced: 0,
  pf: 0,
  tf: 0,
  uf: 0,
  fd: 0,
  pm: 0,
  secs: 0,
});

export const fgm = (s: StatLine) => s.fgm2 + s.fgm3;
export const fga = (s: StatLine) => s.fga2 + s.fga3;
export const reb = (s: StatLine) => s.oreb + s.dreb;

/** Valoración estilo NBA (EFF). */
export const eff = (s: StatLine) =>
  s.pts + reb(s) + s.ast + s.stl + s.blk - (fga(s) - fgm(s)) - (s.fta - s.ftm) - s.tov;

/** Valoración estilo FIBA/Euroliga (PIR). */
export const pir = (s: StatLine) =>
  s.pts + reb(s) + s.ast + s.stl + s.blk + s.fd - (fga(s) - fgm(s) + (s.fta - s.ftm) + s.tov + s.blka + s.pf);

export const pct = (m: number, a: number) => (a > 0 ? m / a : NaN);
export const fmtPct = (v: number) => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : "–");

/** % de tiro efectivo y tiro verdadero. */
export const efg = (s: StatLine) => pct(fgm(s) + 0.5 * s.fgm3, fga(s));
export const ts = (s: StatLine) => {
  const d = 2 * (fga(s) + 0.44 * s.fta);
  return d > 0 ? s.pts / d : NaN;
};

/** Posesiones estimadas (fórmula estándar). */
export const possessions = (s: StatLine) => fga(s) - s.oreb + s.tov + 0.44 * s.fta;

export function addLines(a: StatLine, b: StatLine): StatLine {
  const r = emptyLine();
  (Object.keys(r) as (keyof StatLine)[]).forEach((k) => (r[k] = a[k] + b[k]));
  return r;
}

export function per36(s: StatLine): StatLine {
  const r = emptyLine();
  if (s.secs <= 0) return r;
  const f = (36 * 60) / s.secs;
  (Object.keys(r) as (keyof StatLine)[]).forEach((k) => (r[k] = k === "secs" ? 36 * 60 : s[k] * f));
  return r;
}

export function periodLengthMs(game: Pick<Game, "periods" | "periodMinutes" | "otMinutes">, period: number) {
  return (period <= game.periods ? game.periodMinutes : game.otMinutes) * 60000;
}

/** Milisegundos de juego transcurridos desde el inicio hasta (periodo, reloj). */
export function elapsedMs(game: Pick<Game, "periods" | "periodMinutes" | "otMinutes">, period: number, clockMs: number) {
  let t = 0;
  for (let p = 1; p < period; p++) t += periodLengthMs(game, p);
  return t + (periodLengthMs(game, period) - clockMs);
}

export function sortEvents(events: GameEvent[]): GameEvent[] {
  return [...events]
    .filter((e) => !e.deleted)
    .sort((a, b) => a.period - b.period || b.clockMs - a.clockMs || a.createdAt - b.createdAt);
}

export function periodLabel(game: Pick<Game, "periods">, p: number, lang: "es" | "en" = "es") {
  if (p <= game.periods) return game.periods === 4 ? `${lang === "es" ? "C" : "Q"}${p}` : `P${p}`;
  return `${lang === "es" ? "PR" : "OT"}${p - game.periods}`;
}

export function currentClockMs(clock: Game["clock"], now = Date.now()) {
  if (!clock.running || !clock.startedAt) return clock.remainingMs;
  return Math.min(clock.remainingMs, Math.max(0, clock.remainingMs - (now - clock.startedAt)));
}

export interface LineupStat {
  key: string;
  ids: ID[];
  secs: number;
  ptsFor: number;
  ptsAgainst: number;
  pm: number;
}

export interface ShotPoint {
  id: ID;
  team: TeamSide;
  playerId?: ID;
  x: number;
  y: number;
  made: boolean;
  three: boolean;
  zone: Zone;
}

export interface FlowPoint {
  t: number; // ms transcurridos
  period: number;
  us: number;
  them: number;
}

export interface Run {
  team: TeamSide;
  points: number;
  against: number;
  fromT: number;
  toT: number;
}

export interface GameStats {
  score: { us: number; them: number };
  byPeriod: { period: number; us: number; them: number }[];
  players: Record<ID, StatLine>;
  oppPlayers: Record<ID, StatLine>;
  team: { us: StatLine; them: StatLine };
  teamFouls: Record<number, { us: number; them: number }>;
  timeouts: { us: { period: number }[]; them: { period: number }[] };
  onCourt: ID[];
  lineups: LineupStat[];
  shots: ShotPoint[];
  flow: FlowPoint[];
  runs: Run[];
  leadChanges: number;
  ties: number;
  biggestLead: { us: number; them: number };
  poss: { us: number; them: number; avg: number };
  ortg: { us: number; them: number };
  pace: number; // posesiones por 40 min
  elapsedMs: number;
}

const isShot = (t: GameEvent["type"]) => t === "shot2" || t === "shot3" || t === "ft";

/**
 * Calcula todas las estadísticas del partido.
 * @param nowElapsedMs tiempo transcurrido "actual" para cerrar minutos de quienes están en cancha.
 */
export function computeGame(game: Game, rawEvents: GameEvent[], nowElapsedMs?: number): GameStats {
  const events = sortEvents(rawEvents.filter((e) => e.gameId === game.id));
  const players: Record<ID, StatLine> = {};
  const oppPlayers: Record<ID, StatLine> = {};
  const team = { us: emptyLine(), them: emptyLine() };
  const line = (side: TeamSide, id?: ID) => {
    if (!id) return null;
    const map = side === "us" ? players : oppPlayers;
    return (map[id] ??= emptyLine());
  };
  for (const id of game.rosterIds) players[id] ??= emptyLine();

  const score = { us: 0, them: 0 };
  const byPeriodMap = new Map<number, { us: number; them: number }>();
  const teamFouls: GameStats["teamFouls"] = {};
  const timeouts: GameStats["timeouts"] = { us: [], them: [] };
  const shots: ShotPoint[] = [];
  const flow: FlowPoint[] = [{ t: 0, period: 1, us: 0, them: 0 }];

  // Quinteto en cancha
  let onCourt = new Set<ID>(game.starterIds);
  const entry = new Map<ID, number>();
  game.starterIds.forEach((id) => entry.set(id, 0));
  const lineupMap = new Map<string, LineupStat>();
  const lineupKey = () => [...onCourt].sort().join("|");
  let lineupStart = 0;
  const lineup = () => {
    const key = lineupKey();
    let l = lineupMap.get(key);
    if (!l) {
      l = { key, ids: [...onCourt].sort(), secs: 0, ptsFor: 0, ptsAgainst: 0, pm: 0 };
      lineupMap.set(key, l);
    }
    return l;
  };
  const closeLineup = (t: number) => {
    if (onCourt.size > 0) lineup().secs += Math.max(0, t - lineupStart) / 1000;
    lineupStart = t;
  };

  let maxT = 0;
  for (const e of events) {
    const t = elapsedMs(game, e.period, e.clockMs);
    maxT = Math.max(maxT, t);
    const side: TeamSide = e.team === "them" ? "them" : "us"; // defensivo ante datos corruptos
    const tl = team[side];
    const pl = line(side, e.playerId);
    const bump = (k: keyof StatLine, n = 1) => {
      tl[k] += n;
      if (pl) pl[k] += n;
    };

    switch (e.type) {
      case "shot2":
      case "shot3":
      case "ft": {
        const pts = e.points ?? (e.type === "ft" ? 1 : game.format === "3x3" ? (e.type === "shot3" ? 2 : 1) : e.type === "shot3" ? 3 : 2);
        if (e.type === "ft") {
          bump("fta");
          if (e.made) bump("ftm");
        } else if (e.type === "shot2") {
          bump("fga2");
          if (e.made) bump("fgm2");
        } else {
          bump("fga3");
          if (e.made) bump("fgm3");
        }
        if (e.blockedBy && !e.made) bump("blka");
        if (e.made) {
          bump("pts", pts);
          score[side] += pts;
          const bp = byPeriodMap.get(e.period) ?? { us: 0, them: 0 };
          bp[side] += pts;
          byPeriodMap.set(e.period, bp);
          // +/- de jugadores propios en cancha y del quinteto
          const sign = side === "us" ? 1 : -1;
          onCourt.forEach((id) => {
            (players[id] ??= emptyLine()).pm += sign * pts;
          });
          if (onCourt.size > 0) {
            const l = lineup();
            if (side === "us") l.ptsFor += pts;
            else l.ptsAgainst += pts;
            l.pm += sign * pts;
          }
          flow.push({ t, period: e.period, us: score.us, them: score.them });
        }
        if (e.type !== "ft" && e.x != null && e.y != null) {
          shots.push({
            id: e.id,
            team: side,
            playerId: e.playerId,
            x: e.x,
            y: e.y,
            made: !!e.made,
            three: e.type === "shot3",
            zone: zoneOf(e.x, e.y),
          });
        }
        break;
      }
      case "oreb":
        bump("oreb");
        break;
      case "dreb":
        bump("dreb");
        break;
      case "ast":
        bump("ast");
        break;
      case "stl":
        bump("stl");
        break;
      case "blk":
        bump("blk");
        break;
      case "tov":
        bump("tov");
        break;
      case "tov_forced":
        bump("tovForced");
        break;
      case "foul":
      case "foul_tech":
      case "foul_unsp": {
        bump("pf");
        if (e.type === "foul_tech") bump("tf");
        if (e.type === "foul_unsp") bump("uf");
        const tf = (teamFouls[e.period] ??= { us: 0, them: 0 });
        tf[side] += 1;
        break;
      }
      case "foul_drawn":
        bump("fd");
        break;
      case "timeout":
        timeouts[side].push({ period: e.period });
        break;
      case "sub": {
        if (side !== "us") break;
        closeLineup(t);
        if (e.outId && onCourt.has(e.outId)) {
          const st = entry.get(e.outId) ?? t;
          (players[e.outId] ??= emptyLine()).secs += Math.max(0, t - st) / 1000;
          entry.delete(e.outId);
          onCourt.delete(e.outId);
        }
        if (e.playerId && !onCourt.has(e.playerId)) {
          onCourt.add(e.playerId);
          entry.set(e.playerId, t);
        }
        onCourt = new Set(onCourt);
        break;
      }
      case "period_end":
        break;
    }
  }

  const endT = Math.max(nowElapsedMs ?? maxT, maxT);
  closeLineup(endT);
  onCourt.forEach((id) => {
    const st = entry.get(id) ?? endT;
    (players[id] ??= emptyLine()).secs += Math.max(0, endT - st) / 1000;
  });
  team.us.secs = Object.values(players).reduce((a, p) => a + p.secs, 0);
  team.us.pm = score.us - score.them;
  team.them.pm = score.them - score.us;

  // Rachas, cambios de líder, empates
  const runs: Run[] = [];
  let leadChanges = 0;
  let ties = 0;
  let lastLeader: TeamSide | null = null;
  const biggestLead = { us: 0, them: 0 };
  let cur: Run | null = null;
  for (let i = 1; i < flow.length; i++) {
    const a = flow[i - 1];
    const b = flow[i];
    const scorer: TeamSide = b.us > a.us ? "us" : "them";
    const pts = scorer === "us" ? b.us - a.us : b.them - a.them;
    if (!cur || cur.team !== scorer) {
      if (cur) runs.push(cur);
      cur = { team: scorer, points: pts, against: 0, fromT: a.t, toT: b.t };
    } else {
      cur.points += pts;
      cur.toT = b.t;
    }
    const diff = b.us - b.them;
    if (diff === 0) ties++;
    const leader: TeamSide | null = diff > 0 ? "us" : diff < 0 ? "them" : null;
    if (leader && lastLeader && leader !== lastLeader) leadChanges++;
    if (leader) lastLeader = leader;
    biggestLead.us = Math.max(biggestLead.us, diff);
    biggestLead.them = Math.max(biggestLead.them, -diff);
  }
  if (cur) runs.push(cur);
  runs.sort((a, b) => b.points - a.points);

  const pu = possessions(team.us);
  const pt = possessions(team.them);
  const avg = (pu + pt) / 2;
  const regMs = game.periods * game.periodMinutes * 60000;
  const minutesPlayed = Math.max(endT, 1) / 60000;
  const fullMinutes = (regMs / 60000) || 40;
  const pace = avg > 0 ? (avg * fullMinutes) / Math.max(minutesPlayed, 0.0001) : 0;

  const byPeriod = [...byPeriodMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([period, v]) => ({ period, ...v }));
  const maxPeriod = Math.max(game.clock?.period ?? 1, ...byPeriod.map((b) => b.period), 1);
  const fullByPeriod = Array.from({ length: maxPeriod }, (_, i) => {
    const found = byPeriod.find((b) => b.period === i + 1);
    return found ?? { period: i + 1, us: 0, them: 0 };
  });

  return {
    score,
    byPeriod: fullByPeriod,
    players,
    oppPlayers,
    team,
    teamFouls,
    timeouts,
    onCourt: [...onCourt],
    lineups: [...lineupMap.values()].filter((l) => l.secs > 0 || l.ptsFor || l.ptsAgainst).sort((a, b) => b.pm - a.pm || b.secs - a.secs),
    shots,
    flow,
    runs,
    leadChanges,
    ties,
    biggestLead,
    poss: { us: pu, them: pt, avg },
    ortg: { us: avg > 0 ? (100 * score.us) / avg : NaN, them: avg > 0 ? (100 * score.them) / avg : NaN },
    pace,
    elapsedMs: endT,
  };
}

/** Estadística por zona para mapas de calor. */
export function zoneStats(shots: ShotPoint[]) {
  const r = Object.fromEntries(ZONES.map((z) => [z, { made: 0, att: 0 }])) as Record<Zone, { made: number; att: number }>;
  shots.forEach((s) => {
    r[s.zone].att++;
    if (s.made) r[s.zone].made++;
  });
  return r;
}

/** Faltas de equipo en el periodo y si está en bonus. */
export function bonusInfo(game: Game, stats: GameStats, period: number) {
  const limit = game.format === "3x3" ? 7 : 5;
  // En FIBA las prórrogas cuentan como continuación del último cuarto
  const p = period > game.periods ? game.periods : period;
  let us = 0;
  let them = 0;
  if (game.format === "3x3") {
    Object.values(stats.teamFouls).forEach((f) => {
      us += f.us;
      them += f.them;
    });
  } else {
    for (const [k, f] of Object.entries(stats.teamFouls)) {
      const kp = Number(k) > game.periods ? game.periods : Number(k);
      if (kp === p) {
        us += f.us;
        them += f.them;
      }
    }
  }
  return { us, them, limit, usBonus: them >= limit - 1, themBonus: us >= limit - 1 };
}

/** Tiempos muertos disponibles (FIBA: 2 en 1ª mitad, 3 en 2ª, 1 por prórroga; 3x3: 1). */
export function timeoutsLeft(game: Game, stats: GameStats, side: TeamSide, period: number) {
  const used = stats.timeouts[side];
  if (game.format === "3x3") return Math.max(0, 1 - used.length);
  if (game.periods !== 4) return Math.max(0, 1 - used.filter((t) => t.period === period).length);
  if (period > game.periods) return Math.max(0, 1 - used.filter((t) => t.period === period).length);
  if (period <= 2) return Math.max(0, 2 - used.filter((t) => t.period <= 2).length);
  return Math.max(0, 3 - used.filter((t) => t.period === 3 || t.period === 4).length);
}

/** Jugador eliminado por faltas. */
export function fouledOut(game: Game, s: StatLine) {
  if (game.format === "3x3") return false;
  return s.pf >= 5 || s.uf >= 2 || s.tf >= 2 || (s.uf >= 1 && s.tf >= 1);
}

export const fmtMin = (secs: number) => {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

export const fmtClock = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  if (ms < 60000 && ms > 0) return `${Math.floor(ms / 1000)}.${Math.floor((ms % 1000) / 100)}`;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};
