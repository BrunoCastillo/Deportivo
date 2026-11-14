"use client";
import Link from "next/link";
import { Suspense, useMemo, useRef, useState } from "react";
import { useGame, useQueryParam, type GameBundle } from "@/lib/hooks";
import { usePrefs } from "@/lib/prefs";
import {
  computeGame,
  efg,
  elapsedMs,
  fga,
  fmtClock,
  fmtMin,
  fmtPct,
  pct,
  periodLabel,
  periodLengthMs,
  possessions,
  reb,
  ts,
  eff,
  type GameStats,
} from "@/lib/stats";
import { describeEvent } from "@/lib/describe";
import {
  BOX_HEADERS,
  EVENT_HEADERS,
  boxRows,
  downloadBlob,
  eventRows,
  exportPdf,
  exportXlsx,
  gameFileBase,
  nodeToPng,
  shareImage,
  toCSV,
} from "@/lib/export";
import { Court } from "@/components/Court";
import { BoxTable, type BoxRow } from "@/components/BoxTable";
import { CompareRow, ScoreFlow } from "@/components/Charts";
import { Empty, Icon, PageHeader, Segmented, Stat } from "@/components/ui";
import { Logo } from "@/components/AppShell";
import type { Player } from "@/lib/types";

type Tab = "box" | "shots" | "analysis" | "plays" | "export";

function GameInner() {
  const id = useQueryParam("id");
  const bundle = useGame(id);
  const { t } = usePrefs();
  if (bundle === undefined) return null;
  if (!bundle) return <Empty title={t("Partido no encontrado")} action={<Link href="/games/" className="btn">{t("Volver")}</Link>} />;
  return <GameView bundle={bundle} />;
}

function GameView({ bundle }: { bundle: GameBundle }) {
  const { game, events, players, opponent, team } = bundle;
  const { t, lang } = usePrefs();
  const [tab, setTab] = useState<Tab>("box");
  const nowElapsed = elapsedMs(game, game.clock.period, game.clock.remainingMs);
  const stats = useMemo(() => computeGame(game, events, nowElapsed), [game, events, nowElapsed]);
  const roster = game.rosterIds.map((rid) => players.find((p) => p.id === rid)).filter(Boolean) as Player[];
  const d = new Date(game.date);

  return (
    <div>
      <PageHeader
        back="/games/"
        title={`${team?.name ?? ""} vs ${game.opponentName}`}
        subtitle={`${d.toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${game.format}${game.venue ? ` · ${game.venue}` : ""}`}
        actions={
          <Link href={`/game/live/?id=${game.id}`} className="btn">
            <Icon name={game.status === "final" ? "edit" : "play"} /> <span className="hidden sm:inline">{game.status === "final" ? t("Editar") : t("Anotar")}</span>
          </Link>
        }
      />

      <ScoreHeader stats={stats} game={game} teamName={team?.name ?? ""} teamColor={team?.color} oppColor={opponent?.color} />

      <div className="my-4 overflow-x-auto no-scrollbar">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "box", label: t("Box score") },
            { value: "shots", label: t("Tiros") },
            { value: "analysis", label: t("Análisis") },
            { value: "plays", label: t("Jugadas") },
            { value: "export", label: t("Exportar") },
          ]}
        />
      </div>

      {tab === "box" && <BoxTab stats={stats} roster={roster} teamName={team?.name ?? ""} oppName={game.opponentName} bundle={bundle} />}
      {tab === "shots" && <ShotsTab stats={stats} roster={roster} oppName={game.opponentName} />}
      {tab === "analysis" && <AnalysisTab stats={stats} bundle={bundle} roster={roster} />}
      {tab === "plays" && (
        <div className="card divide-y divide-[var(--line)]">
          {[...events]
            .filter((e) => e.type !== "period_end")
            .sort((a, b) => a.period - b.period || b.clockMs - a.clockMs || a.createdAt - b.createdAt)
            .map((e) => (
              <div key={e.id} className="flex gap-2 px-3 py-2 text-sm">
                <span className="w-16 shrink-0 muted tabular-nums text-xs pt-0.5">
                  {periodLabel(game, e.period, lang)} {fmtClock(e.clockMs)}
                </span>
                <span className={`w-1.5 rounded-full shrink-0 ${e.team === "us" ? "bg-brand" : "bg-rival"}`} />
                <span className="flex-1">{describeEvent(e, players, opponent, lang, game.format === "3x3")}</span>
              </div>
            ))}
          {events.length === 0 && <div className="p-4 muted">{t("Sin jugadas registradas.")}</div>}
        </div>
      )}
      {tab === "export" && <ExportTab stats={stats} bundle={bundle} roster={roster} />}
    </div>
  );
}

function ScoreHeader({ stats, game, teamName, teamColor, oppColor }: { stats: GameStats; game: GameBundle["game"]; teamName: string; teamColor?: string; oppColor?: string }) {
  const { t, lang } = usePrefs();
  return (
    <div className="card p-4">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="text-center">
          <div className="text-sm font-bold truncate">{teamName}</div>
          <div className="text-5xl font-black tabular-nums" style={{ color: teamColor ?? "#ff6a13" }}>
            {stats.score.us}
          </div>
        </div>
        <div className="text-center">
          <span className={`chip ${game.status === "live" ? "!bg-red-500 !border-red-500 text-white" : ""}`}>
            {game.status === "final" ? t("Final") : game.status === "live" ? t("En vivo") : t("Programado")}
          </span>
        </div>
        <div className="text-center">
          <div className="text-sm font-bold truncate">{game.opponentName}</div>
          <div className="text-5xl font-black tabular-nums" style={{ color: oppColor ?? "#2bb3ff" }}>
            {stats.score.them}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto mt-3">
        <table className="tbl !text-center">
          <thead>
            <tr>
              <th></th>
              {stats.byPeriod.map((p) => (
                <th key={p.period} className="!text-center">
                  {periodLabel(game, p.period, lang)}
                </th>
              ))}
              <th className="!text-center">T</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-bold">{teamName}</td>
              {stats.byPeriod.map((p) => (
                <td key={p.period} className="!text-center">
                  {p.us}
                </td>
              ))}
              <td className="!text-center font-black">{stats.score.us}</td>
            </tr>
            <tr>
              <td className="font-bold">{game.opponentName}</td>
              {stats.byPeriod.map((p) => (
                <td key={p.period} className="!text-center">
                  {p.them}
                </td>
              ))}
              <td className="!text-center font-black">{stats.score.them}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BoxTab({ stats, roster, teamName, oppName, bundle }: { stats: GameStats; roster: Player[]; teamName: string; oppName: string; bundle: GameBundle }) {
  const { t } = usePrefs();
  const usRows: BoxRow[] = roster
    .filter((p) => stats.players[p.id])
    .map((p) => ({ id: p.id, num: p.number, name: `${p.firstName} ${p.lastName}`.trim(), s: stats.players[p.id], href: `/player/?id=${p.id}`, note: stats.onCourt.includes(p.id) && bundle.game.status !== "final" ? "●" : undefined }));
  usRows.push({ id: "tot", name: `${t("Total")} ${teamName}`, s: { ...stats.team.us, pm: stats.score.us - stats.score.them }, bold: true });
  const themRows: BoxRow[] = Object.entries(stats.oppPlayers).map(([id, s]) => {
    const op = bundle.opponent?.players.find((x) => x.id === id);
    return { id, num: op?.number, name: op?.name ?? "", s };
  });
  themRows.push({ id: "tot", name: `${t("Total")} ${oppName}`, s: { ...stats.team.them, pm: stats.score.them - stats.score.us, secs: 0 }, bold: true });
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-extrabold mb-2">{teamName}</h3>
        <BoxTable rows={usRows} />
      </div>
      <div>
        <h3 className="font-extrabold mb-2">{oppName}</h3>
        <BoxTable rows={themRows} showMin={false} />
      </div>
      <p className="muted text-xs">
        {t("EFF = PTS + REB + AST + ROB + TAP − tiros fallados − pérdidas. PIR = EFF + faltas recibidas − faltas cometidas − tapones recibidos.")}
      </p>
    </div>
  );
}

function ShotsTab({ stats, roster, oppName }: { stats: GameStats; roster: Player[]; oppName: string }) {
  const { t } = usePrefs();
  const [who, setWho] = useState<string>("us");
  const [heat, setHeat] = useState(false);
  const shots = stats.shots.filter((s) => (who === "us" ? s.team === "us" : who === "them" ? s.team === "them" : s.playerId === who));
  const made = shots.filter((s) => s.made).length;
  return (
    <div className="grid md:grid-cols-[1fr_280px] gap-4">
      <div className="card p-3">
        <div className="flex gap-2 flex-wrap mb-3">
          <select className="input !w-auto" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="us">{t("Todo el equipo")}</option>
            <option value="them">{oppName}</option>
            {roster.map((p) => (
              <option key={p.id} value={p.id}>
                #{p.number} {p.firstName} {p.lastName}
              </option>
            ))}
          </select>
          <Segmented value={heat ? "h" : "s"} onChange={(v) => setHeat(v === "h")} options={[{ value: "s", label: t("Tiros") }, { value: "h", label: t("Calor por zona") }]} />
        </div>
        <div className="max-w-xl mx-auto">
          <Court shots={shots} heat={heat} color={who === "them" ? "#2bb3ff" : "#ff6a13"} />
        </div>
        <div className="text-center muted text-sm mt-2">
          {made}/{shots.length} {t("con ubicación")} · {fmtPct(pct(made, shots.length))}
          {shots.length === 0 && ` · ${t("Usa nivel Avanzado o Pro para registrar la ubicación.")}`}
        </div>
      </div>
      <div className="card p-3">
        <div className="font-bold mb-2">{t("Por jugador")}</div>
        <table className="tbl">
          <thead>
            <tr>
              <th>{t("Jugador")}</th>
              <th>T2</th>
              <th>T3</th>
              <th>eFG%</th>
            </tr>
          </thead>
          <tbody>
            {roster
              .filter((p) => stats.players[p.id] && fga(stats.players[p.id]) > 0)
              .map((p) => {
                const s = stats.players[p.id];
                return (
                  <tr key={p.id} onClick={() => setWho(p.id)} className="cursor-pointer">
                    <td>
                      #{p.number} {p.lastName || p.firstName}
                    </td>
                    <td>
                      {s.fgm2}/{s.fga2}
                    </td>
                    <td>
                      {s.fgm3}/{s.fga3}
                    </td>
                    <td>{fmtPct(efg(s))}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AnalysisTab({ stats, bundle, roster }: { stats: GameStats; bundle: GameBundle; roster: Player[] }) {
  const { t, lang } = usePrefs();
  const { game, team, opponent } = bundle;
  const us = stats.team.us;
  const them = stats.team.them;
  const total = Math.max(stats.elapsedMs, game.periods * game.periodMinutes * 60000);
  const marks: number[] = [];
  let acc = 0;
  for (let p = 1; p < stats.byPeriod.length; p++) {
    acc += periodLengthMs(game, p);
    marks.push(acc);
  }
  const name = (id: string) => {
    const p = roster.find((x) => x.id === id);
    return p ? `#${p.number}` : "?";
  };
  const orb = (a: typeof us, b: typeof us) => pct(a.oreb, a.oreb + b.dreb);
  const tovPct = (a: typeof us) => pct(a.tov, possessions(a));
  const ftr = (a: typeof us) => pct(a.fta, fga(a));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label={t("Posesiones")} value={stats.poss.avg.toFixed(1)} sub={`${stats.poss.us.toFixed(1)} / ${stats.poss.them.toFixed(1)}`} />
        <Stat label={t("Ritmo")} value={stats.pace.toFixed(1)} sub={t("posesiones por partido completo")} />
        <Stat label={t("Ef. ofensiva")} value={Number.isFinite(stats.ortg.us) ? stats.ortg.us.toFixed(1) : "–"} sub={t("pts cada 100 posesiones")} />
        <Stat label={t("Ef. defensiva")} value={Number.isFinite(stats.ortg.them) ? stats.ortg.them.toFixed(1) : "–"} sub={t("pts recibidos cada 100")} />
      </div>

      <div className="card p-4">
        <div className="font-bold mb-2">{t("Evolución del marcador")}</div>
        <ScoreFlow flow={stats.flow} totalMs={total} periodMarks={marks} usColor={team?.color} themColor={opponent?.color} labels={{ us: team?.name ?? "", them: game.opponentName }} />
        <div className="grid grid-cols-3 gap-2 text-center text-sm mt-2">
          <div>
            <div className="font-black text-lg">{stats.leadChanges}</div>
            <div className="muted text-xs">{t("Cambios de líder")}</div>
          </div>
          <div>
            <div className="font-black text-lg">{stats.ties}</div>
            <div className="muted text-xs">{t("Empates")}</div>
          </div>
          <div>
            <div className="font-black text-lg">
              <span className="text-brand">+{stats.biggestLead.us}</span> / <span className="text-rival">+{stats.biggestLead.them}</span>
            </div>
            <div className="muted text-xs">{t("Máxima ventaja")}</div>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="font-bold mb-2">{t("Mejores rachas")}</div>
        <div className="flex flex-wrap gap-2">
          {stats.runs.slice(0, 6).map((r, i) => (
            <span key={i} className={`chip ${r.team === "us" ? "!border-brand text-brand" : "!border-rival text-rival"}`}>
              {r.points}-0 {r.team === "us" ? team?.name : game.opponentName} ({fmtMin(r.fromT / 1000)}–{fmtMin(r.toT / 1000)})
            </span>
          ))}
          {stats.runs.length === 0 && <span className="muted text-sm">–</span>}
        </div>
      </div>

      <div className="card p-4">
        <div className="flex justify-between font-bold mb-2 text-sm">
          <span className="text-brand">{team?.name}</span>
          <span className="text-rival">{game.opponentName}</span>
        </div>
        <CompareRow label={t("Puntos")} a={stats.score.us} b={stats.score.them} />
        <CompareRow label="TC%" a={pct(us.fgm2 + us.fgm3, fga(us))} b={pct(them.fgm2 + them.fgm3, fga(them))} fmt={fmtPct} />
        <CompareRow label="T3%" a={pct(us.fgm3, us.fga3)} b={pct(them.fgm3, them.fga3)} fmt={fmtPct} />
        <CompareRow label="TL%" a={pct(us.ftm, us.fta)} b={pct(them.ftm, them.fta)} fmt={fmtPct} />
        <CompareRow label="eFG%" a={efg(us)} b={efg(them)} fmt={fmtPct} />
        <CompareRow label="TS%" a={ts(us)} b={ts(them)} fmt={fmtPct} />
        <CompareRow label={t("Rebotes")} a={reb(us)} b={reb(them)} />
        <CompareRow label={t("Reb. of. %")} a={orb(us, them)} b={orb(them, us)} fmt={fmtPct} />
        <CompareRow label={t("Asistencias")} a={us.ast} b={them.ast} />
        <CompareRow label={t("Pérdidas")} a={us.tov} b={them.tov} higherIsBetter={false} />
        <CompareRow label={t("Pérd. %")} a={tovPct(us)} b={tovPct(them)} fmt={fmtPct} higherIsBetter={false} />
        <CompareRow label={t("Tiros libres / TC")} a={ftr(us)} b={ftr(them)} fmt={fmtPct} />
        <CompareRow label={t("Robos")} a={us.stl} b={them.stl} />
        <CompareRow label={t("Tapones")} a={us.blk} b={them.blk} />
        <CompareRow label={t("Faltas")} a={us.pf} b={them.pf} higherIsBetter={false} />
      </div>

      <div className="card p-4">
        <div className="font-bold mb-1">{t("Ranking +/- por quinteto")}</div>
        {stats.lineups.length === 0 ? (
          <div className="muted text-sm">{t("Elige titulares y registra cambios para ver quintetos.")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t("Quinteto")}</th>
                  <th>MIN</th>
                  <th>{t("A favor")}</th>
                  <th>{t("En contra")}</th>
                  <th>+/-</th>
                </tr>
              </thead>
              <tbody>
                {stats.lineups.map((l) => (
                  <tr key={l.key}>
                    <td>{l.ids.map(name).join(" · ")}</td>
                    <td>{fmtMin(l.secs)}</td>
                    <td>{l.ptsFor}</td>
                    <td>{l.ptsAgainst}</td>
                    <td className={l.pm > 0 ? "text-ok font-bold" : l.pm < 0 ? "text-bad font-bold" : ""}>{l.pm > 0 ? `+${l.pm}` : l.pm}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card p-4">
        <div className="font-bold mb-2">{t("Por periodo")}</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {stats.byPeriod.map((p) => (
            <div key={p.period} className="surface-2 rounded-xl p-3 text-center">
              <div className="muted text-xs font-bold">{periodLabel(game, p.period, lang)}</div>
              <div className="text-xl font-black tabular-nums">
                {p.us}-{p.them}
              </div>
              <div className={`text-xs font-bold ${p.us > p.them ? "text-ok" : p.us < p.them ? "text-bad" : "muted"}`}>
                {p.us - p.them > 0 ? "+" : ""}
                {p.us - p.them}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExportTab({ stats, bundle, roster }: { stats: GameStats; bundle: GameBundle; roster: Player[] }) {
  const { t, lang } = usePrefs();
  const { game, team, opponent, events, players } = bundle;
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const base = gameFileBase(game, team);
  const run = async (k: string, fn: () => Promise<unknown>) => {
    setBusy(k);
    try {
      await fn();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const top = roster
    .filter((p) => stats.players[p.id])
    .map((p) => ({ p, s: stats.players[p.id] }))
    .sort((a, b) => b.s.pts - a.s.pts || eff(b.s) - eff(a.s));
  const shareText = `${team?.name} ${stats.score.us} - ${stats.score.them} ${game.opponentName}`;

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-4">
      {/* Tarjeta resumen que se exporta como imagen/PDF */}
      <div className="overflow-x-auto">
        <div ref={cardRef} className="p-5 rounded-2xl w-[560px] max-w-none" style={{ background: "var(--surface)", color: "var(--text)" }}>
          <div className="flex items-center gap-2 mb-3">
            <Logo size={28} />
            <div className="font-black">Rebote</div>
            <div className="ml-auto muted text-xs">{new Date(game.date).toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric" })}</div>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center mb-3">
            <div>
              <div className="font-bold text-sm">{team?.name}</div>
              <div className="text-5xl font-black" style={{ color: team?.color ?? "#ff6a13" }}>
                {stats.score.us}
              </div>
            </div>
            <div className="chip">{game.status === "final" ? t("Final") : t("En vivo")}</div>
            <div>
              <div className="font-bold text-sm">{game.opponentName}</div>
              <div className="text-5xl font-black" style={{ color: opponent?.color ?? "#2bb3ff" }}>
                {stats.score.them}
              </div>
            </div>
          </div>
          <div className="text-center muted text-xs mb-3">
            {stats.byPeriod.map((p) => `${p.us}-${p.them}`).join(" · ")}
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>{t("Jugador")}</th>
                <th>PTS</th>
                <th>REB</th>
                <th>AST</th>
                <th>TC</th>
                <th>T3</th>
                <th>EFF</th>
              </tr>
            </thead>
            <tbody>
              {top.slice(0, 10).map(({ p, s }) => (
                <tr key={p.id}>
                  <td>
                    #{p.number} {p.firstName} {p.lastName}
                  </td>
                  <td className="font-black">{s.pts}</td>
                  <td>{reb(s)}</td>
                  <td>{s.ast}</td>
                  <td>
                    {s.fgm2 + s.fgm3}/{fga(s)}
                  </td>
                  <td>
                    {s.fgm3}/{s.fga3}
                  </td>
                  <td>{eff(s)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stats.shots.some((s) => s.team === "us") && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Court shots={stats.shots.filter((s) => s.team === "us")} color={team?.color ?? "#ff6a13"} />
              <Court shots={stats.shots.filter((s) => s.team === "us")} heat />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="card p-4 space-y-2">
          <div className="font-bold">{t("Compartir resumen")}</div>
          <button className="btn btn-primary w-full" disabled={!!busy} onClick={() => run("img", async () => shareImage(await nodeToPng(cardRef.current!), `${base}.png`, shareText))}>
            <Icon name="share" /> {busy === "img" ? "…" : t("Imagen para WhatsApp / redes")}
          </button>
          <button className="btn w-full" disabled={!!busy} onClick={() => run("pdf", async () => exportPdf(await nodeToPng(cardRef.current!), `${base}.pdf`))}>
            <Icon name="download" /> {busy === "pdf" ? "…" : t("Descargar PDF")}
          </button>
        </div>
        <div className="card p-4 space-y-2">
          <div className="font-bold">{t("Datos para análisis")}</div>
          <button
            className="btn w-full"
            onClick={() => downloadBlob(new Blob([toCSV([BOX_HEADERS, ...boxRows(stats, roster, team?.name ?? "", game.opponentName, opponent)])], { type: "text/csv;charset=utf-8" }), `${base}-box.csv`)}
          >
            <Icon name="download" /> {t("Box score CSV")}
          </button>
          <button
            className="btn w-full"
            onClick={() => downloadBlob(new Blob([toCSV([EVENT_HEADERS, ...eventRows(game, events, players, opponent, lang)])], { type: "text/csv;charset=utf-8" }), `${base}-jugadas.csv`)}
          >
            <Icon name="download" /> {t("Jugadas CSV (Power BI)")}
          </button>
          <button
            className="btn w-full"
            disabled={!!busy}
            onClick={() =>
              run("xlsx", () =>
                exportXlsx(`${base}.xlsx`, [
                  { name: "Box score", headers: BOX_HEADERS, rows: boxRows(stats, roster, team?.name ?? "", game.opponentName, opponent) },
                  { name: "Jugadas", headers: EVENT_HEADERS, rows: eventRows(game, events, players, opponent, lang) },
                  {
                    name: "Quintetos",
                    headers: ["Quinteto", "Segundos", "A favor", "En contra", "+/-"],
                    rows: stats.lineups.map((l) => [
                      l.ids.map((id) => `#${roster.find((p) => p.id === id)?.number ?? "?"}`).join(" "),
                      Math.round(l.secs),
                      l.ptsFor,
                      l.ptsAgainst,
                      l.pm,
                    ]),
                  },
                ]),
              )
            }
          >
            <Icon name="download" /> {busy === "xlsx" ? "…" : t("Excel (.xlsx) con 3 hojas")}
          </button>
          <button className="btn w-full" onClick={() => window.print()}>
            {t("Imprimir")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GamePage() {
  return (
    <Suspense>
      <GameInner />
    </Suspense>
  );
}
