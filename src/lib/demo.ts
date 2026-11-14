// Datos de demostración: club, plantillas, rivales y partidos simulados jugada a jugada.
// Útil para revisar la app sin cargar nada a mano. Todo queda marcado en el club "(demo)".
import { saveMany, uid } from "./db";
import { isThree } from "./court";
import { STARTER_DRILLS } from "./factory";
import type {
  Club,
  Competition,
  Drill,
  Game,
  GameEvent,
  Opponent,
  Player,
  Position,
  Season,
  TeamSide,
  Team,
  Training,
} from "./types";

// PRNG con semilla para que la demo sea reproducible
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROSTER: [string, string, string, Position, number][] = [
  // número, nombre, apellido, posición, "talento" (pondera tiros y uso)
  ["4", "Martín", "Gómez", "PG", 1.3],
  ["5", "Lucas", "Díaz", "SG", 1.2],
  ["7", "Tomás", "Ruiz", "SF", 1.4],
  ["8", "Nicolás", "Paz", "PF", 1.0],
  ["10", "Leandro", "Sosa", "C", 1.1],
  ["11", "Iván", "Mora", "PG", 0.8],
  ["12", "Juan", "Vera", "SF", 0.9],
  ["14", "Teo", "Luna", "PF", 0.7],
  ["15", "Bruno", "Ortiz", "C", 0.8],
  ["21", "Facundo", "Ríos", "SG", 0.7],
];

const OPPONENTS = [
  { name: "Halcones del Norte", short: "HAL", color: "#2bb3ff" },
  { name: "Atlético Ribera", short: "ATR", color: "#22c55e" },
  { name: "Club Unión Sur", short: "UNS", color: "#eab308" },
  { name: "Deportivo Andes", short: "AND", color: "#a855f7" },
  { name: "Lobos BC", short: "LOB", color: "#ef4444" },
];

/** Punto de tiro realista según tipo (normalizado a media cancha). */
function shotSpot(r: () => number, three: boolean): { x: number; y: number } {
  for (let i = 0; i < 50; i++) {
    let x: number;
    let y: number;
    if (three) {
      const corner = r() < 0.3;
      if (corner) {
        x = r() < 0.5 ? 0.02 + r() * 0.035 : 0.945 + r() * 0.035;
        y = 0.01 + r() * 0.18;
      } else {
        const ang = (r() - 0.5) * Math.PI * 0.85;
        const d = 6.9 + r() * 1.0;
        x = (7.5 + Math.sin(ang) * d) / 15;
        y = (1.575 + Math.cos(ang) * d) / 14;
      }
    } else {
      const close = r() < 0.6;
      const ang = (r() - 0.5) * Math.PI * (close ? 0.9 : 0.8);
      const d = close ? 0.3 + r() * 2.2 : 2.6 + r() * 3.6;
      x = (7.5 + Math.sin(ang) * d) / 15;
      y = (1.575 + Math.abs(Math.cos(ang)) * d) / 14;
    }
    if (x > 0 && x < 1 && y > 0 && y < 1 && isThree(x, y) === three) return { x, y };
  }
  return three ? { x: 0.5, y: 0.65 } : { x: 0.5, y: 0.2 };
}

interface SimOut {
  events: GameEvent[];
  starters: string[];
  clock: Game["clock"];
}

/** Simula un partido completo 5x5 de 4x10' generando eventos coherentes. */
function simulateGame(gameId: string, clubId: string, players: Player[], talent: Record<string, number>, oppPlayers: Opponent["players"], seed: number, oppStrength: number, detail: Game["detail"]): SimOut {
  const r = rng(seed);
  const pick = <T,>(arr: T[], w?: (x: T) => number) => {
    if (!w) return arr[Math.floor(r() * arr.length)];
    const tot = arr.reduce((a, x) => a + w(x), 0);
    let v = r() * tot;
    for (const x of arr) {
      v -= w(x);
      if (v <= 0) return x;
    }
    return arr[arr.length - 1];
  };
  const events: GameEvent[] = [];
  let created = Date.now() - 1e7;
  const add = (e: Partial<GameEvent> & { type: GameEvent["type"]; team: TeamSide; period: number; clockMs: number }) => {
    const ev = { id: uid(), clubId, gameId, createdAt: created++, updatedAt: created, device: "demo", ...e } as GameEvent;
    events.push(ev);
    return ev;
  };
  const ids = players.map((p) => p.id);
  const starters = ids.slice(0, 5);
  let onCourt = [...starters];
  const fouls: Record<string, number> = {};
  const teamFouls: Record<string, number> = {};
  const usOff = 0.5; // prob. base de acierto en 2
  const periods = 4;
  const len = 600000;
  let ourBall = r() < 0.5;
  let score = { us: 0, them: 0 };
  let finalPeriod = 4;

  for (let period = 1; period <= 6; period++) {
    if (period > periods && score.us !== score.them) break;
    const plen = period > periods ? 300000 : len;
    finalPeriod = period;
    let clock = plen;
    let nextSub = plen - (150000 + r() * 90000);
    teamFouls[`${period}us`] = 0;
    teamFouls[`${period}them`] = 0;
    while (clock > 0) {
      clock -= Math.round(9000 + r() * 16000);
      if (clock <= 0) break;
      // Cambios periódicos (rota la banca)
      if (clock < nextSub) {
        const bench = ids.filter((id) => !onCourt.includes(id) && (fouls[id] ?? 0) < 5);
        const n = 1 + Math.floor(r() * 2);
        for (let i = 0; i < n && bench.length; i++) {
          const outId = pick(onCourt, (id) => 1 / (talent[id] ?? 1));
          const inId = pick(bench, (id) => talent[id] ?? 1);
          bench.splice(bench.indexOf(inId), 1);
          add({ team: "us", type: "sub", playerId: inId, outId, period, clockMs: clock });
          onCourt = onCourt.map((x) => (x === outId ? inId : x));
        }
        nextSub = clock - (120000 + r() * 120000);
      }
      const at = { period, clockMs: clock };
      const side: TeamSide = ourBall ? "us" : "them";
      const other: TeamSide = ourBall ? "them" : "us";
      const shooter = side === "us" ? pick(onCourt, (id) => talent[id] ?? 1) : oppPlayers.length ? pick(oppPlayers).id : undefined;
      const roll = r();
      // Pérdida
      if (roll < 0.14) {
        const tov = add({ team: side, type: "tov", playerId: shooter, tov: detail === "pro" ? pick(["travel", "double", "bad_pass", "lost_ball", "violation"] as const) : undefined, ...at });
        if (r() < 0.55) {
          const stealer = other === "us" ? pick(onCourt) : oppPlayers.length ? pick(oppPlayers).id : undefined;
          add({ team: other, type: "stl", playerId: stealer, parentId: tov.id, ...at });
        }
        ourBall = !ourBall;
        continue;
      }
      // Falta con tiros libres
      if (roll < 0.24) {
        const fouler = other === "us" ? pick(onCourt) : oppPlayers.length ? pick(oppPlayers).id : undefined;
        const foul = add({ team: other, type: r() < 0.03 ? "foul_unsp" : "foul", playerId: fouler, ftCount: 2, ...at });
        if (other === "us" && fouler) fouls[fouler] = (fouls[fouler] ?? 0) + 1;
        teamFouls[`${period}${other}`]++;
        add({ team: side, type: "foul_drawn", playerId: shooter, parentId: foul.id, ...at });
        const pFt = side === "us" ? 0.72 : 0.68;
        let last = true;
        for (let i = 0; i < 2; i++) {
          last = r() < pFt;
          add({ team: side, type: "ft", playerId: shooter, made: last, points: 1, parentId: foul.id, ...at });
          if (last) score[side]++;
        }
        if (!last) {
          const reb = r() < 0.75 ? other : side;
          add({ team: reb, type: reb === side ? "oreb" : "dreb", playerId: reb === "us" ? pick(onCourt) : undefined, ...at });
          ourBall = reb === "us";
        } else ourBall = !ourBall;
        // Jugador con 5 faltas sale
        if (fouler && other === "us" && fouls[fouler] >= 5 && onCourt.includes(fouler)) {
          const bench = ids.filter((id) => !onCourt.includes(id) && (fouls[id] ?? 0) < 5);
          if (bench.length) {
            const inId = pick(bench);
            add({ team: "us", type: "sub", playerId: inId, outId: fouler, period, clockMs: clock });
            onCourt = onCourt.map((x) => (x === fouler ? inId : x));
          }
        }
        continue;
      }
      // Tiro de campo
      const three = r() < 0.36;
      const strength = side === "us" ? (talent[shooter ?? ""] ?? 1) * 0.05 : oppStrength;
      const pMake = (three ? 0.33 : usOff) + strength - 0.05;
      const made = r() < pMake;
      const spot = shotSpot(r, three);
      const blocked = !made && !three && r() < 0.08;
      const shot = add({ team: side, type: three ? "shot3" : "shot2", playerId: shooter, made, points: three ? 3 : 2, x: spot.x, y: spot.y, blockedBy: blocked || undefined, ...at });
      if (blocked) add({ team: other, type: "blk", playerId: other === "us" ? pick(onCourt) : undefined, parentId: shot.id, ...at });
      if (made) {
        score[side] += three ? 3 : 2;
        if (r() < 0.58) {
          const mates = side === "us" ? onCourt.filter((id) => id !== shooter) : oppPlayers.filter((p) => p.id !== shooter).map((p) => p.id);
          if (mates.length) add({ team: side, type: "ast", playerId: pick(mates, (id) => (side === "us" ? (talent[id] ?? 1) : 1)), parentId: shot.id, ...at });
        }
        ourBall = !ourBall;
      } else {
        const off = r() < 0.27;
        const reb = off ? side : other;
        const rebounder = reb === "us" ? (r() < 0.08 ? undefined : pick(onCourt, (id) => (["C", "PF"].includes(players.find((p) => p.id === id)?.position ?? "") ? 2.2 : 1))) : oppPlayers.length && r() < 0.9 ? pick(oppPlayers).id : undefined;
        add({ team: reb, type: off ? "oreb" : "dreb", playerId: rebounder, parentId: shot.id, ...at });
        ourBall = reb === "us";
      }
    }
    if (period === 2 || period === 3) {
      // un tiempo muerto por equipo en algunos periodos
      add({ team: "us", type: "timeout", period, clockMs: Math.round(plen * (0.3 + r() * 0.4)) });
      if (r() < 0.6) add({ team: "them", type: "timeout", period, clockMs: Math.round(plen * (0.2 + r() * 0.5)) });
    }
    add({ team: "us", type: "period_end", period, clockMs: 0 });
  }
  return { events, starters, clock: { period: finalPeriod, remainingMs: 0, running: false } };
}

/** Crea el club de demostración completo. Devuelve el id del club. */
export async function loadDemo(): Promise<string> {
  const now = Date.now();
  const base = { createdAt: now, updatedAt: now };
  const clubId = uid();
  const club: Club = { ...base, id: clubId, clubId, name: "Club Demo Rebote", city: "Ciudad Demo", color: "#ff6a13" };
  const year = new Date().getFullYear();
  const season: Season = { ...base, id: uid(), clubId, name: `Temporada ${year}`, startDate: `${year}-03-01`, endDate: `${year}-12-15` };
  const league: Competition = { ...base, id: uid(), clubId, name: "Liga Regional", kind: "league", seasonId: season.id };
  const cup: Competition = { ...base, id: uid(), clubId, name: "Copa de Invierno", kind: "tournament", seasonId: season.id };
  const team: Team = { ...base, id: uid(), clubId, name: "Primera", category: "Mayores", gender: "M", seasonId: season.id, color: "#ff6a13" };
  const team2: Team = { ...base, id: uid(), clubId, name: "Sub-17", category: "Sub-17", gender: "M", seasonId: season.id, color: "#22c55e" };

  const players: Player[] = ROSTER.map(([number, firstName, lastName, position], i) => ({
    ...base,
    id: uid(),
    clubId,
    teamId: team.id,
    number,
    firstName,
    lastName,
    position,
    status: i === 9 ? "injured" : "active",
    birthYear: 1995 + i,
  }));
  const talent = Object.fromEntries(players.map((p, i) => [p.id, ROSTER[i][4]]));
  const juniors: Player[] = ["Santi Núñez", "Joaquín Gil", "Benja Rojas", "Mateo Cruz", "Felipe Vega", "Dante Soto", "Lautaro Pino"].map((n, i) => {
    const [firstName, lastName] = n.split(" ");
    return { ...base, id: uid(), clubId, teamId: team2.id, number: String(3 + i * 2), firstName, lastName, position: "" as Position, status: "active" as const };
  });

  const opponents: Opponent[] = OPPONENTS.map((o, i) => ({
    ...base,
    id: uid(),
    clubId,
    name: o.name,
    shortName: o.short,
    color: o.color,
    players: i < 2 ? ["3", "6", "9", "13", "17", "20", "23", "33"].map((n) => ({ id: uid(), number: n })) : [],
  }));

  const games: Game[] = [];
  const events: GameEvent[] = [];
  const strengths = [0.02, -0.03, 0.05, -0.01, 0.0, 0.03];
  for (let i = 0; i < 6; i++) {
    const opp = opponents[i % opponents.length];
    const d = new Date(now - (6 - i) * 7 * 86400000);
    d.setHours(19, 30, 0, 0);
    const id = uid();
    const detail: Game["detail"] = i % 3 === 0 ? "pro" : "advanced";
    const roster = players.filter((p) => p.status === "active");
    const sim = simulateGame(id, clubId, roster, talent, opp.players, 1000 + i * 77, strengths[i], detail);
    games.push({
      ...base,
      id,
      clubId,
      teamId: team.id,
      opponentId: opp.id,
      opponentName: opp.name,
      competitionId: i === 4 ? cup.id : league.id,
      seasonId: season.id,
      date: d.toISOString().slice(0, 16),
      venue: i % 2 ? "Estadio Municipal" : "Gimnasio del Club",
      home: i % 2 === 0,
      format: "5x5",
      periods: 4,
      periodMinutes: 10,
      otMinutes: 5,
      detail,
      status: "final",
      rosterIds: roster.map((p) => p.id),
      starterIds: sim.starters,
      clock: sim.clock,
      publicLive: false,
    });
    events.push(...sim.events);
  }
  // Próximo partido (para probar el anotador)
  const next = new Date(now + 2 * 86400000);
  next.setHours(18, 0, 0, 0);
  games.push({
    ...base,
    id: uid(),
    clubId,
    teamId: team.id,
    opponentId: opponents[1].id,
    opponentName: opponents[1].name,
    competitionId: league.id,
    seasonId: season.id,
    date: next.toISOString().slice(0, 16),
    venue: "Gimnasio del Club",
    home: true,
    format: "5x5",
    periods: 4,
    periodMinutes: 10,
    otMinutes: 5,
    detail: "advanced",
    status: "scheduled",
    rosterIds: players.filter((p) => p.status === "active").map((p) => p.id),
    starterIds: [],
    clock: { period: 1, remainingMs: 600000, running: false },
    publicLive: false,
  });

  const drills: Drill[] = STARTER_DRILLS.map((d) => ({ ...d, ...base, id: uid(), clubId }));
  const trainings: Training[] = [0, 1, 2].map((k) => {
    const d = new Date(now - k * 3 * 86400000);
    d.setHours(20, 0, 0, 0);
    const items = drills.slice(k, k + 4).map((x) => ({ drillId: x.id, minutes: x.minutes }));
    return {
      ...base,
      id: uid(),
      clubId,
      teamId: team.id,
      date: d.toISOString().slice(0, 16),
      focus: ["Defensa del bloqueo directo", "Tiro exterior", "Transición ofensiva"][k],
      items,
      minutes: items.reduce((a, x) => a + x.minutes, 0),
      attendance: players.slice(0, 8 - k).map((p) => p.id),
    };
  });

  await saveMany("clubs", [club]);
  await saveMany("seasons", [season]);
  await saveMany("competitions", [league, cup]);
  await saveMany("teams", [team, team2]);
  await saveMany("players", [...players, ...juniors]);
  await saveMany("opponents", opponents);
  await saveMany("games", games);
  await saveMany("events", events);
  await saveMany("drills", drills);
  await saveMany("trainings", trainings);
  return clubId;
}
