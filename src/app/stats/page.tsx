"use client";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useActiveClub, useAllEvents, useClubData, useQueryParam } from "@/lib/hooks";
import { usePrefs } from "@/lib/prefs";
import { aggregate, divide, filterGames, type Filters } from "@/lib/aggregate";
import { efg, fga, fgm, fmtMin, fmtPct, pct, per36, reb, ts, eff, pir, type StatLine } from "@/lib/stats";
import { BOX_HEADERS, exportXlsx, lineRow, downloadBlob, toCSV } from "@/lib/export";
import { BoxTable, type BoxRow } from "@/components/BoxTable";
import { CompareRow } from "@/components/Charts";
import { Court } from "@/components/Court";
import { Empty, Icon, PageHeader, Segmented, Stat } from "@/components/ui";

type Mode = "totals" | "avg" | "per36";

function StatsInner() {
  const { t } = usePrefs();
  const qTeam = useQueryParam("team");
  const { club } = useActiveClub();
  const data = useClubData(club?.id);
  const events = useAllEvents(club?.id);
  const [f, setF] = useState<Filters>({});
  const [mode, setMode] = useState<Mode>("avg");
  const [shotWho, setShotWho] = useState("");
  const [cmpA, setCmpA] = useState("");
  const [cmpB, setCmpB] = useState("");

  useEffect(() => {
    if (qTeam) setF((x) => ({ ...x, teamId: qTeam }));
  }, [qTeam]);

  const games = useMemo(() => (data ? filterGames(data.games, f) : []), [data, f]);
  const agg = useMemo(() => aggregate(games, events ?? []), [games, events]);

  if (!club || !data || !events) return null;

  const n = agg.games.length;
  const players = data.players.filter((p) => !f.teamId || p.teamId === f.teamId);
  const transform = (s: StatLine, gp: number) => (mode === "totals" ? s : mode === "avg" ? divide(s, gp) : per36(s));
  const rows: BoxRow[] = players
    .filter((p) => agg.players[p.id])
    .map((p) => {
      const { line, gp } = agg.players[p.id];
      return { id: p.id, num: p.number, name: `${p.firstName} ${p.lastName}`.trim(), s: transform(line, gp), games: gp, href: `/player/?id=${p.id}` };
    })
    .sort((a, b) => b.s.pts - a.s.pts);
  const teamRow: BoxRow = { id: "team", name: t("Equipo"), s: mode === "per36" ? divide(agg.team, n) : transform(agg.team, n), games: n, bold: true };
  const usAvg = divide(agg.team, n);
  const oppAvg = divide(agg.opp, n);
  const pA = agg.players[cmpA];
  const pB = agg.players[cmpB];
  const name = (id: string) => {
    const p = data.players.find((x) => x.id === id);
    return p ? `#${p.number}` : "?";
  };
  const shots = agg.shots.filter((s) => s.team === "us" && (!shotWho || s.playerId === shotWho));

  const exportSeason = () =>
    exportXlsx(`rebote-temporada-${new Date().toISOString().slice(0, 10)}.xlsx`, [
      {
        name: "Totales",
        headers: ["PJ", ...BOX_HEADERS],
        rows: players.filter((p) => agg.players[p.id]).map((p) => [agg.players[p.id].gp, ...lineRow(p.number, `${p.firstName} ${p.lastName}`, agg.players[p.id].line)]),
      },
      {
        name: "Promedios",
        headers: ["PJ", ...BOX_HEADERS],
        rows: players
          .filter((p) => agg.players[p.id])
          .map((p) => [agg.players[p.id].gp, ...lineRow(p.number, `${p.firstName} ${p.lastName}`, divide(agg.players[p.id].line, agg.players[p.id].gp)).map((v) => (typeof v === "number" ? Math.round(v * 10) / 10 : v))]),
      },
      {
        name: "Partidos",
        headers: ["Fecha", "Rival", "Local", "PF", "PC", "Resultado"],
        rows: agg.games.map(({ game, stats }) => [game.date, game.opponentName, game.home ? "L" : "V", stats.score.us, stats.score.them, stats.score.us > stats.score.them ? "G" : stats.score.us < stats.score.them ? "P" : "E"]),
      },
    ]);

  return (
    <div>
      <PageHeader
        title={t("Análisis")}
        subtitle={`${n} ${t("partidos")} · ${agg.wins}-${agg.losses}`}
        actions={
          <button className="btn" onClick={exportSeason} disabled={!n}>
            <Icon name="download" /> <span className="hidden sm:inline">Excel</span>
          </button>
        }
      />

      {/* Filtros */}
      <div className="card p-3 mb-4 grid grid-cols-2 md:grid-cols-6 gap-2">
        <select className="input" value={f.teamId ?? ""} onChange={(e) => setF({ ...f, teamId: e.target.value || undefined })} aria-label={t("Equipo")}>
          <option value="">{t("Todos los equipos")}</option>
          {data.teams.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <select className="input" value={f.opponentId ?? ""} onChange={(e) => setF({ ...f, opponentId: e.target.value || undefined })} aria-label={t("Rival")}>
          <option value="">{t("Todos los rivales")}</option>
          {data.opponents.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <select className="input" value={f.seasonId ?? ""} onChange={(e) => setF({ ...f, seasonId: e.target.value || undefined })} aria-label={t("Temporada")}>
          <option value="">{t("Todas las temporadas")}</option>
          {data.seasons.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <select className="input" value={f.competitionId ?? ""} onChange={(e) => setF({ ...f, competitionId: e.target.value || undefined })} aria-label={t("Competición")}>
          <option value="">{t("Todas las competiciones")}</option>
          {data.competitions.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <input type="date" className="input" value={f.from ?? ""} onChange={(e) => setF({ ...f, from: e.target.value || undefined })} aria-label={t("Desde")} />
        <input type="date" className="input" value={f.to ?? ""} onChange={(e) => setF({ ...f, to: e.target.value || undefined })} aria-label={t("Hasta")} />
      </div>

      {n === 0 ? (
        <Empty title={t("Sin partidos para estos filtros")} action={<Link href="/games/new/" className="btn btn-primary">{t("Nuevo partido")}</Link>} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label={t("Récord")} value={`${agg.wins}-${agg.losses}`} sub={fmtPct(pct(agg.wins, agg.wins + agg.losses))} />
            <Stat label={t("Puntos a favor")} value={(agg.ptsFor / n).toFixed(1)} sub={t("por partido")} />
            <Stat label={t("Puntos en contra")} value={(agg.ptsAgainst / n).toFixed(1)} sub={t("por partido")} />
            <Stat
              label={t("Ef. of. / def.")}
              value={`${agg.poss.us ? ((100 * agg.ptsFor) / ((agg.poss.us + agg.poss.them) / 2)).toFixed(0) : "–"} / ${agg.poss.us ? ((100 * agg.ptsAgainst) / ((agg.poss.us + agg.poss.them) / 2)).toFixed(0) : "–"}`}
              sub={t("pts cada 100 posesiones")}
            />
          </div>

          <div className="card p-3">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <div className="font-bold flex-1">{t("Jugadores")}</div>
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: "totals", label: t("Totales") },
                  { value: "avg", label: t("Promedio") },
                  { value: "per36", label: t("Por 36 min") },
                ]}
              />
            </div>
            <BoxTable rows={[...rows, teamRow]} mode={mode} />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="card p-4">
              <div className="flex justify-between font-bold mb-2 text-sm">
                <span className="text-brand">{t("Nosotros")}</span>
                <span className="muted">{t("Equipo vs rivales (promedio)")}</span>
                <span className="text-rival">{t("Rivales")}</span>
              </div>
              <CompareRow label={t("Puntos")} a={agg.ptsFor / n} b={agg.ptsAgainst / n} fmt={(v) => v.toFixed(1)} />
              <CompareRow label="TC%" a={pct(fgm(agg.team), fga(agg.team))} b={pct(fgm(agg.opp), fga(agg.opp))} fmt={fmtPct} />
              <CompareRow label="T3%" a={pct(agg.team.fgm3, agg.team.fga3)} b={pct(agg.opp.fgm3, agg.opp.fga3)} fmt={fmtPct} />
              <CompareRow label="eFG%" a={efg(agg.team)} b={efg(agg.opp)} fmt={fmtPct} />
              <CompareRow label="TS%" a={ts(agg.team)} b={ts(agg.opp)} fmt={fmtPct} />
              <CompareRow label={t("Rebotes")} a={reb(usAvg)} b={reb(oppAvg)} fmt={(v) => v.toFixed(1)} />
              <CompareRow label={t("Asistencias")} a={usAvg.ast} b={oppAvg.ast} fmt={(v) => v.toFixed(1)} />
              <CompareRow label={t("Pérdidas")} a={usAvg.tov} b={oppAvg.tov} fmt={(v) => v.toFixed(1)} higherIsBetter={false} />
              <CompareRow label={t("Robos")} a={usAvg.stl} b={oppAvg.stl} fmt={(v) => v.toFixed(1)} />
              <CompareRow label={t("Faltas")} a={usAvg.pf} b={oppAvg.pf} fmt={(v) => v.toFixed(1)} higherIsBetter={false} />
            </div>

            <div className="card p-4">
              <div className="font-bold mb-2">{t("Jugador vs jugador")}</div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                {[cmpA, cmpB].map((v, i) => (
                  <select key={i} className="input" value={v} onChange={(e) => (i === 0 ? setCmpA(e.target.value) : setCmpB(e.target.value))}>
                    <option value="">{t("Elegir jugador")}</option>
                    {players
                      .filter((p) => agg.players[p.id])
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          #{p.number} {p.firstName} {p.lastName}
                        </option>
                      ))}
                  </select>
                ))}
              </div>
              {pA && pB ? (
                (() => {
                  const a = divide(pA.line, pA.gp);
                  const b = divide(pB.line, pB.gp);
                  const r = (v: number) => v.toFixed(1);
                  return (
                    <>
                      <CompareRow label={t("Puntos")} a={a.pts} b={b.pts} fmt={r} />
                      <CompareRow label={t("Rebotes")} a={reb(a)} b={reb(b)} fmt={r} />
                      <CompareRow label={t("Asistencias")} a={a.ast} b={b.ast} fmt={r} />
                      <CompareRow label={t("Robos")} a={a.stl} b={b.stl} fmt={r} />
                      <CompareRow label={t("Pérdidas")} a={a.tov} b={b.tov} fmt={r} higherIsBetter={false} />
                      <CompareRow label="TC%" a={pct(fgm(pA.line), fga(pA.line))} b={pct(fgm(pB.line), fga(pB.line))} fmt={fmtPct} />
                      <CompareRow label="T3%" a={pct(pA.line.fgm3, pA.line.fga3)} b={pct(pB.line.fgm3, pB.line.fga3)} fmt={fmtPct} />
                      <CompareRow label="TS%" a={ts(pA.line)} b={ts(pB.line)} fmt={fmtPct} />
                      <CompareRow label="EFF" a={eff(a)} b={eff(b)} fmt={r} />
                      <CompareRow label="PIR" a={pir(a)} b={pir(b)} fmt={r} />
                      <CompareRow label="+/-" a={a.pm} b={b.pm} fmt={r} />
                      <CompareRow label={t("Minutos")} a={a.secs} b={b.secs} fmt={(v) => fmtMin(v)} />
                    </>
                  );
                })()
              ) : (
                <div className="muted text-sm">{t("Elige dos jugadores para comparar promedios por partido.")}</div>
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="font-bold flex-1">{t("Mapa de calor")}</div>
                <select className="input !w-auto" value={shotWho} onChange={(e) => setShotWho(e.target.value)}>
                  <option value="">{t("Todo el equipo")}</option>
                  {players
                    .filter((p) => agg.players[p.id])
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.number} {p.lastName || p.firstName}
                      </option>
                    ))}
                </select>
              </div>
              <Court shots={shots} heat />
              <div className="muted text-xs text-center mt-1">
                {shots.filter((s) => s.made).length}/{shots.length} {t("tiros con ubicación")}
              </div>
            </div>
            <div className="card p-4">
              <div className="font-bold mb-2">{t("Mejores quintetos (+/-)")}</div>
              {agg.lineups.length === 0 ? (
                <div className="muted text-sm">{t("Sin datos de quintetos.")}</div>
              ) : (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>{t("Quinteto")}</th>
                      <th>MIN</th>
                      <th>+/-</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agg.lineups.slice(0, 10).map((l) => (
                      <tr key={l.key}>
                        <td>{l.ids.map(name).join(" ")}</td>
                        <td>{fmtMin(l.secs)}</td>
                        <td className={l.pm > 0 ? "text-ok font-bold" : l.pm < 0 ? "text-bad font-bold" : ""}>{l.pm > 0 ? `+${l.pm}` : l.pm}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center mb-2">
              <div className="font-bold flex-1">{t("Partidos")}</div>
              <button
                className="btn !min-h-[36px] text-sm"
                onClick={() =>
                  downloadBlob(
                    new Blob(
                      [
                        toCSV([
                          ["fecha", "rival", "local", "pf", "pc", "posesiones", "ef_of", "ef_def"],
                          ...agg.games.map(({ game, stats }) => [
                            game.date,
                            game.opponentName,
                            game.home ? 1 : 0,
                            stats.score.us,
                            stats.score.them,
                            Math.round(stats.poss.avg * 10) / 10,
                            Math.round(stats.ortg.us * 10) / 10 || "",
                            Math.round(stats.ortg.them * 10) / 10 || "",
                          ]),
                        ]),
                      ],
                      { type: "text/csv;charset=utf-8" },
                    ),
                    "rebote-partidos.csv",
                  )
                }
              >
                CSV
              </button>
            </div>
            <div className="divide-y divide-[var(--line)]">
              {agg.games.map(({ game, stats }) => (
                <Link key={game.id} href={`/game/?id=${game.id}`} className="flex items-center gap-3 py-2 text-sm">
                  <span className="muted w-24 shrink-0">{game.date.slice(0, 10)}</span>
                  <span className="flex-1 truncate">
                    {game.home ? "vs" : "@"} {game.opponentName}
                  </span>
                  <span className="muted text-xs hidden sm:inline">
                    {t("Pos.")} {stats.poss.avg.toFixed(0)} · ORtg {Number.isFinite(stats.ortg.us) ? stats.ortg.us.toFixed(0) : "–"}
                  </span>
                  <span className={`font-black tabular-nums ${stats.score.us > stats.score.them ? "text-ok" : stats.score.us < stats.score.them ? "text-bad" : ""}`}>
                    {stats.score.us}-{stats.score.them}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StatsPage() {
  return (
    <Suspense>
      <StatsInner />
    </Suspense>
  );
}
