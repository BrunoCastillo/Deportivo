"use client";
import { Suspense, useEffect, useState } from "react";
import { sb, cloudEnabled } from "@/lib/supabase";
import { useNow, useQueryParam } from "@/lib/hooks";
import { usePrefs } from "@/lib/prefs";
import { currentClockMs, fmtClock } from "@/lib/stats";
import { Logo } from "@/components/AppShell";
import type { ClockState } from "@/lib/types";

interface LiveData {
  us: string;
  them: string;
  usColor?: string;
  themColor?: string;
  score: { us: number; them: number };
  byPeriod: { period: number; us: number; them: number }[];
  period: number;
  periods: number;
  clock: ClockState;
  status: string;
  fouls: { us: number; them: number };
  top: { n?: string; name: string; pts: number; reb: number; ast: number }[];
  format: string;
}

function pl(periods: number, p: number, lang: string) {
  if (p <= periods) return periods === 4 ? `${lang === "es" ? "C" : "Q"}${p}` : `P${p}`;
  return `${lang === "es" ? "PR" : "OT"}${p - periods}`;
}

function LiveInner() {
  const g = useQueryParam("g");
  const { t, lang } = usePrefs();
  const [data, setData] = useState<LiveData | null>(null);
  const [updated, setUpdated] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const now = useNow(250, !!data?.clock.running);

  useEffect(() => {
    const c = sb();
    if (!c || !g) return;
    const load = async () => {
      const { data: row, error } = await c.from("live_scores").select("data, updated_at").eq("game_id", g).maybeSingle();
      if (error) setErr(error.message);
      else if (row) {
        setData(row.data as LiveData);
        setUpdated(row.updated_at as string);
        setErr(null);
      } else setErr(t("Este partido no tiene marcador público activo."));
    };
    void load();
    const ch = c
      .channel(`live-${g}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_scores", filter: `game_id=eq.${g}` }, (p) => {
        const row = p.new as { data: LiveData; updated_at: string };
        if (row?.data) {
          setData(row.data);
          setUpdated(row.updated_at);
        }
      })
      .subscribe();
    const poll = setInterval(load, 10000);
    return () => {
      clearInterval(poll);
      void c.removeChannel(ch);
    };
  }, [g]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cloudEnabled) return <div className="p-6 text-center muted">{t("Marcador público no disponible en modo local.")}</div>;
  if (!data) return <div className="p-6 text-center muted">{err ?? t("Cargando…")}</div>;

  const clockMs = currentClockMs(data.clock, now);
  return (
    <div className="min-h-dvh p-4 max-w-xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Logo size={28} />
        <div className="font-black">Rebote</div>
        <span className={`ml-auto chip ${data.status === "final" ? "" : "!bg-red-500 !border-red-500 text-white"}`}>{data.status === "final" ? t("Final") : t("EN VIVO")}</span>
      </div>
      <div className="card p-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
          <div>
            <div className="font-bold">{data.us}</div>
            <div className="text-6xl font-black tabular-nums" style={{ color: data.usColor ?? "#ff6a13" }}>
              {data.score.us}
            </div>
            <div className="muted text-xs">
              {t("Faltas")}: {data.fouls.us}
            </div>
          </div>
          <div>
            <div className="muted text-sm font-bold">{pl(data.periods, data.period, lang)}</div>
            <div className={`text-3xl font-black tabular-nums ${data.clock.running ? "text-ok" : ""}`}>{fmtClock(clockMs)}</div>
          </div>
          <div>
            <div className="font-bold">{data.them}</div>
            <div className="text-6xl font-black tabular-nums" style={{ color: data.themColor ?? "#2bb3ff" }}>
              {data.score.them}
            </div>
            <div className="muted text-xs">
              {t("Faltas")}: {data.fouls.them}
            </div>
          </div>
        </div>
        <div className="flex justify-center gap-3 mt-4 text-sm muted">
          {data.byPeriod.map((p) => (
            <span key={p.period}>
              {pl(data.periods, p.period, lang)}: {p.us}-{p.them}
            </span>
          ))}
        </div>
      </div>
      <div className="card mt-4 overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>{data.us}</th>
              <th>PTS</th>
              <th>REB</th>
              <th>AST</th>
            </tr>
          </thead>
          <tbody>
            {data.top.filter((p) => p.pts || p.reb || p.ast).map((p, i) => (
              <tr key={i}>
                <td>
                  #{p.n} {p.name}
                </td>
                <td className="font-black">{p.pts}</td>
                <td>{p.reb}</td>
                <td>{p.ast}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {updated && <div className="muted text-xs text-center mt-3">{t("Actualizado")}: {new Date(updated).toLocaleTimeString(lang)}</div>}
    </div>
  );
}

export default function PublicLivePage() {
  return (
    <Suspense>
      <LiveInner />
    </Suspense>
  );
}
