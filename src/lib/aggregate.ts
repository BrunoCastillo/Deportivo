// Agregados de temporada: suma partidos filtrados y calcula totales, promedios y por 36 min.
import { addLines, computeGame, elapsedMs, emptyLine, type GameStats, type LineupStat, type ShotPoint, type StatLine } from "./stats";
import type { Game, GameEvent, ID } from "./types";

export interface Filters {
  teamId?: string;
  opponentId?: string;
  seasonId?: string;
  competitionId?: string;
  from?: string;
  to?: string;
}

export function filterGames(games: Game[], f: Filters) {
  return games.filter(
    (g) =>
      g.status !== "scheduled" &&
      (!f.teamId || g.teamId === f.teamId) &&
      (!f.opponentId || g.opponentId === f.opponentId) &&
      (!f.seasonId || g.seasonId === f.seasonId) &&
      (!f.competitionId || g.competitionId === f.competitionId) &&
      (!f.from || g.date.slice(0, 10) >= f.from) &&
      (!f.to || g.date.slice(0, 10) <= f.to),
  );
}

export interface Aggregate {
  games: { game: Game; stats: GameStats }[];
  wins: number;
  losses: number;
  ptsFor: number;
  ptsAgainst: number;
  team: StatLine;
  opp: StatLine;
  players: Record<ID, { line: StatLine; gp: number }>;
  shots: ShotPoint[];
  lineups: LineupStat[];
  poss: { us: number; them: number };
}

export function aggregate(games: Game[], events: GameEvent[]): Aggregate {
  const byGame = new Map<string, GameEvent[]>();
  for (const e of events) {
    if (e.deleted) continue;
    const arr = byGame.get(e.gameId) ?? [];
    arr.push(e);
    byGame.set(e.gameId, arr);
  }
  const out: Aggregate = {
    games: [],
    wins: 0,
    losses: 0,
    ptsFor: 0,
    ptsAgainst: 0,
    team: emptyLine(),
    opp: emptyLine(),
    players: {},
    shots: [],
    lineups: [],
    poss: { us: 0, them: 0 },
  };
  const lineupMap = new Map<string, LineupStat>();
  for (const g of games) {
    const st = computeGame(g, byGame.get(g.id) ?? [], elapsedMs(g, g.clock.period, g.clock.remainingMs));
    out.games.push({ game: g, stats: st });
    if (g.status === "final") {
      if (st.score.us > st.score.them) out.wins++;
      else if (st.score.us < st.score.them) out.losses++;
    }
    out.ptsFor += st.score.us;
    out.ptsAgainst += st.score.them;
    out.team = addLines(out.team, { ...st.team.us, pm: st.score.us - st.score.them });
    out.opp = addLines(out.opp, st.team.them);
    out.poss.us += st.poss.us;
    out.poss.them += st.poss.them;
    for (const [pid, line] of Object.entries(st.players)) {
      const played = line.secs > 0 || line.pts || line.fga2 || line.fga3 || line.fta || line.oreb || line.dreb || line.ast || line.stl || line.blk || line.tov || line.pf;
      if (!played) continue;
      const cur = (out.players[pid] ??= { line: emptyLine(), gp: 0 });
      cur.line = addLines(cur.line, line);
      cur.gp++;
    }
    out.shots.push(...st.shots);
    for (const l of st.lineups) {
      const cur = lineupMap.get(l.key);
      if (cur) {
        cur.secs += l.secs;
        cur.ptsFor += l.ptsFor;
        cur.ptsAgainst += l.ptsAgainst;
        cur.pm += l.pm;
      } else lineupMap.set(l.key, { ...l });
    }
  }
  out.lineups = [...lineupMap.values()].sort((a, b) => b.pm - a.pm);
  return out;
}

export function divide(s: StatLine, n: number): StatLine {
  const r = emptyLine();
  if (n <= 0) return r;
  (Object.keys(r) as (keyof StatLine)[]).forEach((k) => (r[k] = s[k] / n));
  return r;
}
