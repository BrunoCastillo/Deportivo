import { describe, expect, it } from "vitest";
import type { EventType, Game, GameEvent, TeamSide } from "./types";
import {
  bonusInfo,
  computeGame,
  eff,
  efg,
  elapsedMs,
  emptyLine,
  fouledOut,
  per36,
  pir,
  possessions,
  sortEvents,
  timeoutsLeft,
  ts,
  type StatLine,
} from "./stats";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGame(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    clubId: "c1",
    createdAt: 0,
    updatedAt: 0,
    teamId: "t1",
    opponentName: "Rival",
    date: "2026-11-14T18:00",
    home: true,
    format: "5x5",
    periods: 4,
    periodMinutes: 10,
    otMinutes: 5,
    detail: "pro",
    status: "final",
    rosterIds: ["A", "B", "C", "D", "E", "F", "G"],
    starterIds: ["A", "B", "C", "D", "E"],
    clock: { period: 5, remainingMs: 0, running: false },
    publicLive: false,
    ...over,
  };
}

/** "m:ss" remaining → ms */
const clk = (s: string) => {
  const [m, sec] = s.split(":").map(Number);
  return (m * 60 + sec) * 1000;
};

function builder(gameId = "g1", format: "5x5" | "3x3" = "5x5") {
  let seq = 0;
  const events: GameEvent[] = [];
  const pv = (type: EventType) =>
    type === "shot3" ? (format === "3x3" ? 2 : 3) : type === "shot2" ? (format === "3x3" ? 1 : 2) : 1;
  const add = (
    period: number,
    clock: string,
    team: TeamSide,
    type: EventType,
    extra: Partial<GameEvent> = {},
  ): GameEvent => {
    seq++;
    const e: GameEvent = {
      id: `e${seq}`,
      clubId: "c1",
      gameId,
      createdAt: seq,
      updatedAt: seq,
      team,
      type,
      period,
      clockMs: clk(clock),
      ...(type === "shot2" || type === "shot3" || type === "ft" ? { points: pv(type) } : {}),
      ...extra,
    };
    events.push(e);
    return e;
  };
  return { events, add };
}

const line = (over: Partial<StatLine>): StatLine => ({ ...emptyLine(), ...over });

// ---------------------------------------------------------------------------
// Simulated full 5x5 game (4x10' + 1 OT of 5'), final 26-24 for "us".
//
// Lineup timeline (elapsed game seconds):
//   L1  0    – 300   A B C D E
//   L2  300  – 720   A B C D F   (Q1 5:00  F in, E out)
//   L3  720  – 1200  B C D E F   (Q2 8:00  E in, A out)
//   L4  1200 – 2280  A B C D E   (Q3 10:00 A in, F out)
//   L5  2280 – 2400  A C D E G   (Q4 2:00  G in, B out)
//   L6  2400 – 2520  A B C D E   (OT 5:00  B in, G out)
//   L7  2520 – 2700  A B C E G   (OT 3:00  G in, D out — D fouled out)
// ---------------------------------------------------------------------------
function buildFullGame() {
  const { events, add } = builder();
  // ---- Q1 ----
  add(1, "9:40", "us", "shot2", { playerId: "A", made: true, x: 0.5, y: 0.15 }); // 2-0  t=20
  add(1, "9:40", "us", "ast", { playerId: "B" });
  add(1, "9:20", "them", "shot3", { playerId: "o1", made: false }); //               t=40
  add(1, "9:18", "us", "dreb", { playerId: "C" });
  add(1, "9:00", "us", "shot3", { playerId: "B", made: true, x: 0.03, y: 0.05 }); // 5-0  t=60
  add(1, "8:30", "them", "shot2", { playerId: "o2", made: true }); //               5-2  t=90
  add(1, "8:00", "us", "shot2", { playerId: "C", made: false, x: 0.2, y: 0.3 }); //      t=120
  add(1, "7:58", "us", "oreb"); // team offensive rebound (no playerId)
  add(1, "7:50", "us", "shot2", { playerId: "D", made: true }); //                  7-2  t=130 (and-one)
  add(1, "7:50", "them", "foul", { playerId: "o3" });
  add(1, "7:50", "us", "foul_drawn", { playerId: "D" });
  add(1, "7:50", "us", "ft", { playerId: "D", made: true }); //                     8-2
  add(1, "7:00", "us", "tov", { playerId: "E", tov: "bad_pass" });
  add(1, "6:58", "them", "stl", { playerId: "o4" });
  add(1, "6:50", "them", "shot2", { playerId: "o4", made: true }); //               8-4  t=190
  add(1, "5:00", "us", "sub", { playerId: "F", outId: "E" }); //                         t=300
  add(1, "4:00", "us", "foul", { playerId: "A" }); //                                    t=360
  add(1, "4:00", "them", "ft", { playerId: "o1", made: true }); //                  8-5
  add(1, "4:00", "them", "ft", { playerId: "o1", made: false });
  add(1, "4:00", "us", "dreb"); // team defensive rebound
  add(1, "3:00", "us", "foul", { playerId: "A" });
  add(1, "2:30", "us", "foul", { playerId: "B" });
  add(1, "2:00", "us", "foul", { playerId: "C" }); // 4th team foul in Q1
  add(1, "1:00", "them", "timeout");
  add(1, "0:30", "us", "shot2", { playerId: "F", made: false, blockedBy: true });
  add(1, "0:30", "them", "blk", { playerId: "o5" });
  add(1, "0:00", "us", "period_end");
  // ---- Q2 ----  (Q1: 8-5)
  add(2, "9:00", "them", "shot3", { playerId: "o1", made: true }); //               8-8  t=660 tie
  add(2, "8:00", "us", "sub", { playerId: "E", outId: "A" }); //                         t=720
  add(2, "7:00", "us", "foul_tech", { playerId: "D" }); //                               t=780
  add(2, "7:00", "them", "ft", { playerId: "o2", made: true }); //                  8-9  LC
  add(2, "6:00", "us", "timeout");
  add(2, "5:00", "us", "shot2", { playerId: "E", made: true }); //                 10-9  t=900 LC
  add(2, "5:00", "us", "ast", { playerId: "F" });
  add(2, "4:00", "them", "shot2", { playerId: "o3", made: true }); //             10-11  t=960 LC
  add(2, "3:00", "us", "shot3", { playerId: "B", made: true }); //                13-11  t=1020 LC
  add(2, "1:00", "us", "timeout");
  add(2, "0:00", "us", "period_end");
  // ---- Q3 ----  (Q2: 5-6, half 13-11)
  add(3, "10:00", "us", "sub", { playerId: "A", outId: "F" }); //                        t=1200
  add(3, "9:00", "us", "foul_unsp", { playerId: "C" }); //                               t=1260
  add(3, "9:00", "them", "ft", { playerId: "o4", made: true }); //                13-12
  add(3, "9:00", "them", "ft", { playerId: "o4", made: true }); //                13-13 tie
  add(3, "8:00", "them", "shot2", { playerId: "o5", made: true }); //             13-15  t=1320 LC
  add(3, "7:00", "us", "shot2", { playerId: "A", made: true }); //                15-15  t=1380 tie
  add(3, "6:00", "us", "stl", { playerId: "E" });
  add(3, "5:55", "us", "shot2", { playerId: "E", made: true }); //                17-15  t=1445 LC
  add(3, "5:00", "us", "foul", { playerId: "D" });
  add(3, "4:00", "them", "timeout");
  add(3, "2:00", "them", "shot3", { playerId: "o1", made: false });
  add(3, "1:58", "them", "oreb", { playerId: "o2" });
  add(3, "1:55", "them", "shot2", { playerId: "o2", made: true }); //             17-17  t=1685 tie
  add(3, "0:00", "us", "period_end");
  // ---- Q4 ----  (Q3: 4-6)
  add(4, "9:00", "us", "shot3", { playerId: "A", made: true }); //                20-17  t=1860
  add(4, "8:00", "them", "shot3", { playerId: "o3", made: true }); //             20-20  t=1920 tie
  add(4, "7:00", "us", "foul", { playerId: "A" });
  add(4, "6:00", "us", "foul", { playerId: "B" });
  add(4, "5:30", "us", "foul", { playerId: "D" });
  add(4, "5:00", "them", "timeout");
  add(4, "3:00", "them", "timeout");
  add(4, "2:00", "us", "sub", { playerId: "G", outId: "B" }); //                         t=2280
  add(4, "1:00", "them", "shot2", { playerId: "o4", made: true }); //             20-22  t=2340 LC
  add(4, "0:30", "us", "shot2", { playerId: "G", made: true }); //                22-22  t=2370 tie
  add(4, "0:30", "us", "ast", { playerId: "A" });
  add(4, "0:10", "them", "tov", { playerId: "o5" });
  add(4, "0:00", "us", "period_end");
  // ---- OT (period 5, 5 min) ----  (Q4: 5-5, regulation 22-22)
  add(5, "5:00", "us", "sub", { playerId: "B", outId: "G" }); //                         t=2400
  add(5, "4:00", "us", "foul", { playerId: "E" });
  add(5, "3:30", "us", "foul", { playerId: "D" });
  add(5, "3:00", "us", "foul", { playerId: "D" }); // D: 5th PF → fouled out      t=2520
  add(5, "3:00", "them", "ft", { playerId: "o1", made: true }); //                22-23
  add(5, "3:00", "them", "ft", { playerId: "o1", made: true }); //                22-24
  add(5, "3:00", "us", "sub", { playerId: "G", outId: "D" }); // after the FTs (createdAt order)
  add(5, "2:00", "us", "shot3", { playerId: "C", made: true }); //                25-24  t=2580 LC
  add(5, "2:00", "us", "ast", { playerId: "E" });
  add(5, "1:00", "them", "shot2", { playerId: "o2", made: false });
  add(5, "1:00", "us", "dreb"); // team defensive rebound
  add(5, "0:30", "them", "foul", { playerId: "o5" }); //                                 t=2670
  add(5, "0:30", "us", "foul_drawn", { playerId: "A" });
  add(5, "0:30", "us", "ft", { playerId: "A", made: true }); //                   26-24
  add(5, "0:30", "us", "ft", { playerId: "A", made: false });
  add(5, "0:30", "them", "dreb", { playerId: "o3" });
  add(5, "0:05", "them", "shot3", { playerId: "o1", made: false });
  add(5, "0:05", "us", "dreb", { playerId: "B" });
  add(5, "0:00", "us", "period_end"); //                                                 t=2700
  return events;
}

describe("time helpers", () => {
  const g = makeGame();
  it("elapsedMs converts (period, remaining) into game time incl. OT", () => {
    expect(elapsedMs(g, 1, 600000)).toBe(0);
    expect(elapsedMs(g, 1, 0)).toBe(600000);
    expect(elapsedMs(g, 3, clk("7:30"))).toBe(2 * 600000 + 150000);
    expect(elapsedMs(g, 5, 300000)).toBe(2400000); // OT start
    expect(elapsedMs(g, 5, 0)).toBe(2700000);
    expect(elapsedMs(g, 6, 0)).toBe(3000000); // 2nd OT
  });

  it("sortEvents orders by period asc, clock desc, createdAt asc and drops deleted", () => {
    const { add, events } = builder();
    const a = add(2, "5:00", "us", "ast");
    const b = add(1, "1:00", "us", "ast");
    const c = add(1, "9:00", "us", "ast");
    const d = add(1, "1:00", "us", "ast", { createdAt: 0 }); // same clock as b, created earlier
    const x = add(1, "5:00", "us", "ast", { deleted: true });
    const sorted = sortEvents(events).map((e) => e.id);
    expect(sorted).toEqual([c.id, d.id, b.id, a.id]);
    expect(sorted).not.toContain(x.id);
  });
});

describe("simulated full 5x5 game with OT", () => {
  const game = makeGame();
  const events = buildFullGame();
  const s = computeGame(game, events);

  it("has at least 40 events", () => {
    expect(events.length).toBeGreaterThanOrEqual(40);
  });

  it("final score and score by period", () => {
    // Q1 8-5, Q2 5-6, Q3 4-6, Q4 5-5, OT 4-2  → 26-24
    expect(s.score).toEqual({ us: 26, them: 24 });
    expect(s.byPeriod).toEqual([
      { period: 1, us: 8, them: 5 },
      { period: 2, us: 5, them: 6 },
      { period: 3, us: 4, them: 6 },
      { period: 4, us: 5, them: 5 },
      { period: 5, us: 4, them: 2 },
    ]);
    expect(s.elapsedMs).toBe(2700000);
  });

  it("every player's box score line", () => {
    const P = s.players;
    // A: 2 (Q1) + 2 (Q3) + 3 (Q4) + 1/2 FT (OT) = 8; fouls Q1 x2, Q4 x1; ast Q4; fd OT
    expect(P.A).toMatchObject(
      line({ pts: 8, fgm2: 2, fga2: 2, fgm3: 1, fga3: 1, ftm: 1, fta: 2, ast: 1, pf: 3, fd: 1, pm: 0, secs: 2220 }),
    );
    // B: two made 3s; ast Q1; dreb OT; fouls Q1, Q4
    expect(P.B).toMatchObject(line({ pts: 6, fgm3: 2, fga3: 2, ast: 1, dreb: 1, pf: 2, pm: 2, secs: 2580 }));
    // C: missed 2 Q1, made 3 OT; dreb Q1; foul Q1 + unsportsmanlike Q3
    expect(P.C).toMatchObject(
      line({ pts: 3, fga2: 1, fgm3: 1, fga3: 1, dreb: 1, pf: 2, uf: 1, pm: 2, secs: 2700 }),
    );
    // D: and-one (2+1); tech Q2 + fouls Q3, Q4, OT x2 = 5 PF
    expect(P.D).toMatchObject(
      line({ pts: 3, fgm2: 1, fga2: 1, ftm: 1, fta: 1, fd: 1, pf: 5, tf: 1, pm: -2, secs: 2520 }),
    );
    // E: 2 + 2; tov Q1; stl Q3; ast OT; foul OT
    expect(P.E).toMatchObject(line({ pts: 4, fgm2: 2, fga2: 2, tov: 1, stl: 1, ast: 1, pf: 1, pm: 6, secs: 2280 }));
    // F: blocked miss; ast Q2
    expect(P.F).toMatchObject(line({ fga2: 1, blka: 1, ast: 1, pm: -2, secs: 900 }));
    // G: 1 made 2
    expect(P.G).toMatchObject(line({ pts: 2, fgm2: 1, fga2: 1, pm: 4, secs: 300 }));
    const sumPts = Object.values(P).reduce((a, p) => a + p.pts, 0);
    expect(sumPts).toBe(26);
  });

  it("EFF and PIR per player", () => {
    // EFF = PTS+REB+AST+STL+BLK − missFG − missFT − TOV
    // PIR = PTS+REB+AST+STL+BLK+FD − (missFG + missFT + TOV + BLKA + PF)
    const P = s.players;
    // A: EFF 8+1−1 = 8; PIR 8+1+1 − (1+3) = 6
    expect(eff(P.A)).toBe(8);
    expect(pir(P.A)).toBe(6);
    // B: EFF 6+1+1 = 8; PIR 8 − 2 = 6
    expect(eff(P.B)).toBe(8);
    expect(pir(P.B)).toBe(6);
    // C: EFF 3+1−1 = 3; PIR 4 − (1+2) = 1
    expect(eff(P.C)).toBe(3);
    expect(pir(P.C)).toBe(1);
    // D: EFF 3; PIR 3+1 − 5 = −1
    expect(eff(P.D)).toBe(3);
    expect(pir(P.D)).toBe(-1);
    // E: EFF 4+1+1−1 = 5; PIR 6 − (1+1) = 4
    expect(eff(P.E)).toBe(5);
    expect(pir(P.E)).toBe(4);
    // F: EFF 1−1 = 0; PIR 1 − (1 missFG + 1 BLKA) = −1
    expect(eff(P.F)).toBe(0);
    expect(pir(P.F)).toBe(-1);
    expect(eff(P.G)).toBe(2);
    expect(pir(P.G)).toBe(2);
  });

  it("+/- : player values, sum = 5 × point differential", () => {
    // Lineup segments (for-against): L1 8-4, L2 0-4, L3 5-3, L4 7-9, L5 2-2, L6 0-2, L7 4-0
    const sum = Object.values(s.players).reduce((a, p) => a + p.pm, 0);
    expect(sum).toBe(5 * (26 - 24));
    expect(s.team.us.pm).toBe(2);
    expect(s.team.them.pm).toBe(-2);
  });

  it("minutes: sum of secs = 5 × elapsed game seconds", () => {
    const sum = Object.values(s.players).reduce((a, p) => a + p.secs, 0);
    expect(sum).toBe(5 * 2700);
    expect(s.team.us.secs).toBe(13500);
    expect([...s.onCourt].sort()).toEqual(["A", "B", "C", "E", "G"]);
  });

  it("lineup stats", () => {
    // ABCDE: L1+L4+L6 = 300+1080+120 s, 15-15 ; ABCDF 420 s 0-4 ; BCDEF 480 s 5-3
    // ACDEG 120 s 2-2 ; ABCEG 180 s 4-0. Sorted by pm desc, then secs desc.
    expect(s.lineups.map((l) => ({ key: l.key, secs: l.secs, f: l.ptsFor, a: l.ptsAgainst, pm: l.pm }))).toEqual([
      { key: "A|B|C|E|G", secs: 180, f: 4, a: 0, pm: 4 },
      { key: "B|C|D|E|F", secs: 480, f: 5, a: 3, pm: 2 },
      { key: "A|B|C|D|E", secs: 1500, f: 15, a: 15, pm: 0 },
      { key: "A|C|D|E|G", secs: 120, f: 2, a: 2, pm: 0 },
      { key: "A|B|C|D|F", secs: 420, f: 0, a: 4, pm: -4 },
    ]);
    expect(s.lineups.reduce((a, l) => a + l.secs, 0)).toBe(2700);
    expect(s.lineups.reduce((a, l) => a + l.pm, 0)).toBe(2);
  });

  it("team totals, team rebounds, possessions, ORtg and pace", () => {
    // us: FGA 8 (2pt) + 4 (3pt) = 12, OREB 1 (team), TOV 1, FTA 3 → 12 − 1 + 1 + 1.32 = 13.32
    expect(s.team.us).toMatchObject({ fga2: 8, fgm2: 6, fga3: 4, fgm3: 4, fta: 3, ftm: 2, oreb: 1, dreb: 4, tov: 1 });
    // them: FGA 7 + 5 = 12, OREB 1, TOV 1, FTA 7 → 12 − 1 + 1 + 3.08 = 15.08
    expect(s.team.them).toMatchObject({ fga2: 7, fgm2: 6, fga3: 5, fgm3: 2, fta: 7, ftm: 6, oreb: 1, dreb: 1, tov: 1, stl: 1, blk: 1 });
    expect(s.poss.us).toBeCloseTo(13.32, 10);
    expect(s.poss.them).toBeCloseTo(15.08, 10);
    expect(s.poss.avg).toBeCloseTo(14.2, 10);
    expect(s.ortg.us).toBeCloseTo((100 * 26) / 14.2, 8); // 183.10
    expect(s.ortg.them).toBeCloseTo((100 * 24) / 14.2, 8); // 169.01
    // pace: 14.2 possessions in 45 minutes, scaled to 40 → 12.622
    expect(s.pace).toBeCloseTo((14.2 * 40) / 45, 8);
    // team rebounds go to team totals but not to any player
    const playerOreb = Object.values(s.players).reduce((a, p) => a + p.oreb, 0);
    const playerDreb = Object.values(s.players).reduce((a, p) => a + p.dreb, 0);
    expect(playerOreb).toBe(0);
    expect(playerDreb).toBe(2);
  });

  it("opponent player lines", () => {
    // o1: 3pt 1/4, FT 3/4 → 6 pts
    expect(s.oppPlayers.o1).toMatchObject({ pts: 6, fgm3: 1, fga3: 4, ftm: 3, fta: 4 });
    expect(s.oppPlayers.o2).toMatchObject({ pts: 5, fgm2: 2, fga2: 3, ftm: 1, fta: 1, oreb: 1 });
    expect(s.oppPlayers.o5).toMatchObject({ pts: 2, blk: 1, tov: 1, pf: 1 });
  });

  it("runs, lead changes, ties, biggest lead", () => {
    // flow: 2-0 5-0 5-2 7-2 8-2 8-4 8-5 8-8* 8-9L 10-9L 10-11L 13-11L 13-12 13-13* 13-15L
    //       15-15* 17-15L 17-17* 20-17 20-20* 20-22L 22-22* 22-23 22-24 25-24L 26-24
    expect(s.leadChanges).toBe(8);
    expect(s.ties).toBe(6);
    expect(s.biggestLead).toEqual({ us: 6, them: 2 });
    // runs (scorer streaks): us5 them2 us3 them7 us2 them2 us3 them4 us4 them2 us3 them5 us2 them2 us4
    expect(s.runs).toHaveLength(15);
    expect(s.runs[0]).toEqual({ team: "them", points: 7, against: 0, fromT: 130000, toT: 780000 });
    expect(s.runs[1]).toMatchObject({ team: "us", points: 5, fromT: 0, toT: 60000 });
    expect(s.runs.filter((r) => r.team === "us").reduce((a, r) => a + r.points, 0)).toBe(26);
    expect(s.runs.filter((r) => r.team === "them").reduce((a, r) => a + r.points, 0)).toBe(24);
    expect(s.flow).toHaveLength(1 + 26); // initial 0-0 + one point per made basket/FT (26 scoring events)
  });

  it("team fouls and bonusInfo (OT counts as Q4)", () => {
    expect(s.teamFouls[1]).toEqual({ us: 4, them: 1 });
    expect(s.teamFouls[2]).toEqual({ us: 1, them: 0 }); // technical counts as team foul
    expect(s.teamFouls[3]).toEqual({ us: 2, them: 0 }); // unsportsmanlike counts
    expect(s.teamFouls[4]).toEqual({ us: 3, them: 0 });
    expect(s.teamFouls[5]).toEqual({ us: 3, them: 1 });
    // Q1: us committed 4 → the 5th is penalised → opponent in bonus
    expect(bonusInfo(game, s, 1)).toEqual({ us: 4, them: 1, limit: 5, usBonus: false, themBonus: true });
    expect(bonusInfo(game, s, 2)).toEqual({ us: 1, them: 0, limit: 5, usBonus: false, themBonus: false });
    expect(bonusInfo(game, s, 3)).toMatchObject({ us: 2, themBonus: false });
    // Q4 and OT are aggregated: 3 + 3 = 6 us, 0 + 1 = 1 them
    expect(bonusInfo(game, s, 4)).toEqual({ us: 6, them: 1, limit: 5, usBonus: false, themBonus: true });
    expect(bonusInfo(game, s, 5)).toEqual(bonusInfo(game, s, 4));
  });

  it("timeoutsLeft (2 first half, 3 second half, 1 per OT)", () => {
    // us: Q2 x2. them: Q1, Q3, Q4 x2
    expect(timeoutsLeft(game, s, "us", 1)).toBe(0);
    expect(timeoutsLeft(game, s, "us", 2)).toBe(0);
    expect(timeoutsLeft(game, s, "us", 3)).toBe(3);
    expect(timeoutsLeft(game, s, "us", 5)).toBe(1);
    expect(timeoutsLeft(game, s, "them", 1)).toBe(1);
    expect(timeoutsLeft(game, s, "them", 3)).toBe(0);
    expect(timeoutsLeft(game, s, "them", 4)).toBe(0);
    expect(timeoutsLeft(game, s, "them", 5)).toBe(1); // OT gets a fresh one
  });

  it("fouledOut", () => {
    expect(fouledOut(game, s.players.D)).toBe(true); // 5 PF
    expect(fouledOut(game, s.players.A)).toBe(false);
    expect(fouledOut(game, s.players.C)).toBe(false); // 1 UF only
    expect(fouledOut(game, line({ pf: 2, uf: 2 }))).toBe(true);
    expect(fouledOut(game, line({ pf: 2, tf: 2 }))).toBe(true);
    expect(fouledOut(game, line({ pf: 2, tf: 1, uf: 1 }))).toBe(true);
    expect(fouledOut(game, line({ pf: 4, tf: 1 }))).toBe(false);
    expect(fouledOut(makeGame({ format: "3x3" }), line({ pf: 9, uf: 2 }))).toBe(false);
  });

  it("per36", () => {
    // C played 2700 s → factor 2160/2700 = 0.8 ; G played 300 s → factor 7.2
    const c = per36(s.players.C);
    expect(c.pts).toBeCloseTo(2.4, 10);
    expect(c.dreb).toBeCloseTo(0.8, 10);
    expect(c.secs).toBe(2160);
    expect(per36(s.players.G).pts).toBeCloseTo(14.4, 10);
    expect(per36(emptyLine())).toEqual(emptyLine());
  });

  it("shot chart only includes FG with coordinates", () => {
    expect(s.shots.map((x) => [x.playerId, x.made, x.three, x.zone])).toEqual([
      ["A", true, false, "paint"],
      ["B", true, true, "corner3_left"],
      ["C", false, false, "mid_left"],
    ]);
  });

  it("is independent of input array order", () => {
    const shuffled = [...events].reverse();
    expect(computeGame(game, shuffled)).toEqual(s);
  });

  it("ignores events from other games", () => {
    const other = { ...events[0], id: "zz", gameId: "other" };
    expect(computeGame(game, [...events, other]).score).toEqual(s.score);
  });

  it("nowElapsedMs closes minutes of players still on court", () => {
    // Stop the game after Q1 (keep only period 1) and ask at t = 700 s
    const q1 = events.filter((e) => e.period === 1);
    const r = computeGame(game, q1, 700000);
    // L1 0-300 ABCDE, then ABCDF until 700
    expect(r.players.E.secs).toBe(300);
    expect(r.players.F.secs).toBe(400);
    expect(r.players.A.secs).toBe(700);
    expect(Object.values(r.players).reduce((a, p) => a + p.secs, 0)).toBe(5 * 700);
  });
});

describe("undo semantics (deleted events)", () => {
  const game = makeGame();
  const base = buildFullGame();
  const s = computeGame(game, base);

  it("deleted events are ignored entirely", () => {
    const { add, events: extra } = builder();
    add(2, "2:00", "us", "shot3", { playerId: "G", made: true, deleted: true });
    add(2, "2:00", "us", "sub", { playerId: "G", outId: "B", deleted: true });
    add(3, "1:00", "us", "foul", { playerId: "A", deleted: true });
    add(3, "1:00", "them", "timeout", { deleted: true });
    const r = computeGame(game, [...base, ...extra.map((e) => ({ ...e, id: `x${e.id}` }))]);
    expect(r).toEqual(s);
  });

  it("deleting a made basket removes points, +/- and flow", () => {
    // Delete C's OT 3 (25-24) → final 23-24, them win, lead changes 7
    const ev = base.map((e) =>
      e.period === 5 && e.type === "shot3" && e.playerId === "C" ? { ...e, deleted: true } : e,
    );
    const r = computeGame(game, ev);
    expect(r.score).toEqual({ us: 23, them: 24 });
    expect(r.players.C.pts).toBe(0);
    expect(r.leadChanges).toBe(7);
    expect(Object.values(r.players).reduce((a, p) => a + p.pm, 0)).toBe(5 * -1);
  });

  it("deleting a sub restores the previous lineup", () => {
    const ev = base.map((e) => (e.type === "sub" && e.playerId === "F" && e.period === 1 ? { ...e, deleted: true } : e));
    const r = computeGame(game, ev);
    // Without 'F in, E out', E never leaves; the Q2 'E in, A out' sub only removes A (E already
    // on court) → B C D E (4 players) until Q3 'A in, F out' (F not on court) adds A back.
    expect(r.players.F.secs).toBe(0);
    expect(r.players.E.secs).toBe(2700);
    expect(r.players.A.secs).toBe(720 + 1500);
  });
});

describe("out-of-order insertion", () => {
  const game = makeGame({ rosterIds: ["A", "B", "C", "D", "E", "F"], clock: { period: 1, remainingMs: 0, running: false } });

  it("an event created later with an earlier clock is attributed to the lineup on court at that time", () => {
    const { add, events } = builder();
    add(1, "5:00", "us", "sub", { playerId: "F", outId: "E" }); // created first
    add(1, "1:00", "us", "shot2", { playerId: "F", made: true }); // F on court
    // forgotten basket at 8:00 inserted afterwards (createdAt larger, earlier game time)
    add(1, "8:00", "us", "shot3", { playerId: "E", made: true });
    add(1, "0:00", "us", "period_end");
    const r = computeGame(game, events);
    expect(r.score.us).toBe(5);
    expect(r.players.E.pm).toBe(3); // E was on court at 8:00, not at 1:00
    expect(r.players.F.pm).toBe(2);
    expect(r.players.A.pm).toBe(5);
    expect(r.flow.map((f) => f.t)).toEqual([0, 120000, 540000]);
    expect(r.flow.map((f) => f.us)).toEqual([0, 3, 5]);
    expect(r.players.E.secs).toBe(300);
    expect(r.players.F.secs).toBe(300);
  });

  it("same-clock events keep insertion (createdAt) order: FTs before the sub", () => {
    const { add, events } = builder();
    add(1, "4:00", "them", "ft", { made: true });
    add(1, "4:00", "us", "sub", { playerId: "F", outId: "E" });
    add(1, "4:00", "them", "ft", { made: true }); // recorded after the sub
    const r = computeGame(game, events);
    expect(r.players.E.pm).toBe(-1);
    expect(r.players.F.pm).toBe(-1);
    expect(r.players.A.pm).toBe(-2);
  });
});

describe("3x3", () => {
  const game = makeGame({
    format: "3x3",
    periods: 1,
    periodMinutes: 10,
    otMinutes: 0,
    rosterIds: ["A", "B", "C", "D"],
    starterIds: ["A", "B", "C"],
    clock: { period: 1, remainingMs: 0, running: false },
  });

  it("point values: shot2 = 1, shot3 (arc) = 2, ft = 1", () => {
    const { add, events } = builder("g1", "3x3");
    add(1, "9:00", "us", "shot2", { playerId: "A", made: true });
    add(1, "8:00", "us", "shot3", { playerId: "B", made: true });
    add(1, "7:00", "us", "ft", { playerId: "C", made: true });
    add(1, "6:00", "them", "shot3", { made: true });
    add(1, "5:00", "us", "shot3", { playerId: "B", made: false });
    const r = computeGame(game, events);
    expect(r.score).toEqual({ us: 4, them: 2 });
    expect(r.players.A.pts).toBe(1);
    expect(r.players.B).toMatchObject({ pts: 2, fgm3: 1, fga3: 2 });
    expect(Object.values(r.players).reduce((a, p) => a + p.pm, 0)).toBe(3 * 2);
  });

  it("falls back to 3x3 point values when an event has no `points`", () => {
    const { add, events } = builder("g1", "3x3");
    add(1, "9:00", "us", "shot2", { playerId: "A", made: true, points: undefined });
    add(1, "8:00", "us", "shot3", { playerId: "B", made: true, points: undefined });
    const r = computeGame(game, events);
    expect(r.score.us).toBe(3);
  });

  it("bonus at 7 team fouls (whole game), no foul-outs, 1 timeout", () => {
    const { add, events } = builder("g1", "3x3");
    for (let i = 0; i < 6; i++) add(1, `${9 - i}:00`, "us", "foul", { playerId: "A" });
    add(1, "2:00", "us", "timeout");
    let r = computeGame(game, events);
    // 6 fouls → the 7th is penalised → opponent in bonus
    expect(bonusInfo(game, r, 1)).toEqual({ us: 6, them: 0, limit: 7, usBonus: false, themBonus: true });
    expect(fouledOut(game, r.players.A)).toBe(false);
    expect(timeoutsLeft(game, r, "us", 1)).toBe(0);
    expect(timeoutsLeft(game, r, "them", 1)).toBe(1);
    // 5 fouls → not yet
    r = computeGame(game, events.slice(0, 5));
    expect(bonusInfo(game, r, 1).themBonus).toBe(false);
    // fouls in overtime (period 2) still accumulate
    add(1, "1:00", "us", "foul", { playerId: "B" });
    add(2, "0:00", "us", "foul", { playerId: "B" });
    r = computeGame(game, events);
    expect(bonusInfo(game, r, 2).us).toBe(8);
  });
});

describe("rating & shooting formulas on a synthetic line", () => {
  // 10 pts: 3/6 2PT, 1/3 3PT, 1/2 FT ; 2 OREB 3 DREB 4 AST 1 STL 1 BLK 2 TOV 1 BLKA 3 PF 2 FD
  const s = line({
    pts: 10, fgm2: 3, fga2: 6, fgm3: 1, fga3: 3, ftm: 1, fta: 2,
    oreb: 2, dreb: 3, ast: 4, stl: 1, blk: 1, tov: 2, blka: 1, pf: 3, fd: 2,
  });
  it("EFF = 10+5+4+1+1 − 5 − 1 − 2 = 13", () => expect(eff(s)).toBe(13));
  it("PIR = 10+5+4+1+1+2 − (5+1+2+1+3) = 11", () => expect(pir(s)).toBe(11));
  it("eFG% = (4 + 0.5) / 9", () => expect(efg(s)).toBeCloseTo(4.5 / 9, 12));
  it("TS% = 10 / (2·(9 + 0.88))", () => expect(ts(s)).toBeCloseTo(10 / (2 * 9.88), 12));
  it("possessions = 9 − 2 + 2 + 0.88", () => expect(possessions(s)).toBeCloseTo(9.88, 12));
  it("NaN-safe on empty line", () => {
    expect(efg(emptyLine())).toBeNaN();
    expect(ts(emptyLine())).toBeNaN();
  });
});
