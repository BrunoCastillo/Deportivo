"use client";
import Link from "next/link";
import { Suspense, useMemo } from "react";
import { useActiveClub, useAllEvents, useClubData, useQueryParam } from "@/lib/hooks";
import { usePrefs } from "@/lib/prefs";
import { aggregate, divide } from "@/lib/aggregate";
import { efg, fga, fgm, fmtMin, fmtPct, pct, per36, reb, ts, eff, pir } from "@/lib/stats";
import { Court } from "@/components/Court";
import { Avatar, Empty, PageHeader, Stat } from "@/components/ui";

function PlayerInner() {
  const id = useQueryParam("id");
  const { t } = usePrefs();
  const { club } = useActiveClub();
  const data = useClubData(club?.id);
  const events = useAllEvents(club?.id);
  const player = data?.players.find((p) => p.id === id);
  const games = useMemo(() => (data && player ? data.games.filter((g) => g.status !== "scheduled" && g.rosterIds.includes(player.id)) : []), [data, player]);
  const agg = useMemo(() => aggregate(games, events ?? []), [games, events]);

  if (!data || !events) return null;
  if (!player) return <Empty title={t("Jugador no encontrado")} />;
  const team = data.teams.find((x) => x.id === player.teamId);
  const mine = agg.players[player.id];
  const line = mine?.line;
  const gp = mine?.gp ?? 0;
  const avg = line ? divide(line, gp) : undefined;
  const p36 = line ? per36(line) : undefined;
  const shots = agg.shots.filter((s) => s.playerId === player.id);

  return (
    <div>
      <PageHeader
        back={`/team/?id=${player.teamId}`}
        title={
          <span className="flex items-center gap-3">
            <Avatar photo={player.photo} text={player.number} color={team?.color} size={44} />
            <span>
              #{player.number} {player.firstName} {player.lastName}
            </span>
          </span>
        }
        subtitle={`${team?.name ?? ""} · ${player.position || "—"}`}
      />
      {!line || !avg || !p36 ? (
        <Empty title={t("Sin partidos jugados todavía")} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            <Stat label="PJ" value={gp} />
            <Stat label="PTS" value={avg.pts.toFixed(1)} sub={`${line.pts} ${t("total")}`} />
            <Stat label="REB" value={reb(avg).toFixed(1)} />
            <Stat label="AST" value={avg.ast.toFixed(1)} />
            <Stat label="EFF" value={eff(avg).toFixed(1)} sub={`PIR ${pir(avg).toFixed(1)}`} />
            <Stat label="MIN" value={fmtMin(avg.secs)} sub={`+/- ${avg.pm.toFixed(1)}`} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="TC%" value={fmtPct(pct(fgm(line), fga(line)))} sub={`${fgm(line)}/${fga(line)}`} />
            <Stat label="T3%" value={fmtPct(pct(line.fgm3, line.fga3))} sub={`${line.fgm3}/${line.fga3}`} />
            <Stat label="TL%" value={fmtPct(pct(line.ftm, line.fta))} sub={`${line.ftm}/${line.fta}`} />
            <Stat label="eFG%" value={fmtPct(efg(line))} />
            <Stat label="TS%" value={fmtPct(ts(line))} />
          </div>
          <div className="card p-4">
            <div className="font-bold mb-2">{t("Por 36 minutos")}</div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
              {[
                ["PTS", p36.pts],
                ["REB", reb(p36)],
                ["AST", p36.ast],
                ["ROB", p36.stl],
                ["TAP", p36.blk],
                ["PÉR", p36.tov],
              ].map(([k, v]) => (
                <div key={k as string} className="surface-2 rounded-xl p-2">
                  <div className="text-xl font-black">{(v as number).toFixed(1)}</div>
                  <div className="muted text-xs font-bold">{k}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="card p-3">
              <div className="font-bold mb-2">{t("Mapa de tiros")}</div>
              <Court shots={shots} color={team?.color} />
            </div>
            <div className="card p-3">
              <div className="font-bold mb-2">{t("Mapa de calor")}</div>
              <Court shots={shots} heat />
            </div>
          </div>
          <div className="card p-3">
            <div className="font-bold mb-2">{t("Partido a partido")}</div>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{t("Partido")}</th>
                    <th>MIN</th>
                    <th>PTS</th>
                    <th>REB</th>
                    <th>AST</th>
                    <th>TC</th>
                    <th>T3</th>
                    <th>+/-</th>
                    <th>EFF</th>
                  </tr>
                </thead>
                <tbody>
                  {agg.games.map(({ game, stats }) => {
                    const s = stats.players[player.id];
                    if (!s) return null;
                    return (
                      <tr key={game.id}>
                        <td>
                          <Link href={`/game/?id=${game.id}`} className="hover:text-brand">
                            {game.date.slice(5, 10)} {game.opponentName}
                          </Link>
                        </td>
                        <td>{fmtMin(s.secs)}</td>
                        <td className="font-bold">{s.pts}</td>
                        <td>{reb(s)}</td>
                        <td>{s.ast}</td>
                        <td>
                          {fgm(s)}/{fga(s)}
                        </td>
                        <td>
                          {s.fgm3}/{s.fga3}
                        </td>
                        <td>{s.pm}</td>
                        <td>{eff(s)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PlayerPage() {
  return (
    <Suspense>
      <PlayerInner />
    </Suspense>
  );
}
