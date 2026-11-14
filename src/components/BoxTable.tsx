"use client";
import Link from "next/link";
import { eff, fga, fgm, fmtMin, fmtPct, pct, pir, reb, type StatLine } from "@/lib/stats";
import { usePrefs } from "@/lib/prefs";

export interface BoxRow {
  id: string;
  num?: string;
  name: string;
  s: StatLine;
  href?: string;
  bold?: boolean;
  note?: string;
  games?: number;
}

const r1 = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

export function BoxTable({ rows, mode = "totals", showMin = true }: { rows: BoxRow[]; mode?: "totals" | "avg" | "per36"; showMin?: boolean }) {
  const { t } = usePrefs();
  const f = (v: number) => (mode === "totals" ? String(Math.round(v)) : r1(v));
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="tbl">
        <thead>
          <tr>
            <th>{t("Jugador")}</th>
            {rows.some((r) => r.games != null) && <th>PJ</th>}
            {showMin && <th>MIN</th>}
            <th>PTS</th>
            <th title={t("Tiros de campo")}>TC</th>
            <th>TC%</th>
            <th>T2</th>
            <th>T3</th>
            <th>T3%</th>
            <th>TL</th>
            <th>TL%</th>
            <th>RO</th>
            <th>RD</th>
            <th>REB</th>
            <th>AST</th>
            <th>ROB</th>
            <th>TAP</th>
            <th>PÉR</th>
            <th>FC</th>
            <th>FR</th>
            <th>+/-</th>
            <th>EFF</th>
            <th>PIR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const s = r.s;
            return (
              <tr key={r.id} className={r.bold ? "font-black" : ""}>
                <td>
                  {r.href ? (
                    <Link href={r.href} className="hover:text-brand">
                      {r.num ? <span className="text-brand">#{r.num} </span> : null}
                      {r.name}
                    </Link>
                  ) : (
                    <>
                      {r.num ? <span className="text-brand">#{r.num} </span> : null}
                      {r.name}
                    </>
                  )}
                  {r.note && <span className="ml-1">{r.note}</span>}
                </td>
                {rows.some((x) => x.games != null) && <td>{r.games ?? ""}</td>}
                {showMin && <td>{fmtMin(s.secs)}</td>}
                <td className="font-bold">{f(s.pts)}</td>
                <td>
                  {f(fgm(s))}/{f(fga(s))}
                </td>
                <td>{fmtPct(pct(fgm(s), fga(s)))}</td>
                <td>
                  {f(s.fgm2)}/{f(s.fga2)}
                </td>
                <td>
                  {f(s.fgm3)}/{f(s.fga3)}
                </td>
                <td>{fmtPct(pct(s.fgm3, s.fga3))}</td>
                <td>
                  {f(s.ftm)}/{f(s.fta)}
                </td>
                <td>{fmtPct(pct(s.ftm, s.fta))}</td>
                <td>{f(s.oreb)}</td>
                <td>{f(s.dreb)}</td>
                <td>{f(reb(s))}</td>
                <td>{f(s.ast)}</td>
                <td>{f(s.stl)}</td>
                <td>{f(s.blk)}</td>
                <td>{f(s.tov)}</td>
                <td>{f(s.pf)}</td>
                <td>{f(s.fd)}</td>
                <td className={s.pm > 0 ? "text-ok" : s.pm < 0 ? "text-bad" : ""}>{s.pm > 0 ? `+${f(s.pm)}` : f(s.pm)}</td>
                <td>{f(eff(s))}</td>
                <td>{f(pir(s))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
