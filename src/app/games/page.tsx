"use client";
import Link from "next/link";
import { useState } from "react";
import { useActiveClub, useAllEvents, useClubData } from "@/lib/hooks";
import { usePrefs } from "@/lib/prefs";
import { computeGame } from "@/lib/stats";
import { Empty, Icon, PageHeader, Segmented } from "@/components/ui";

export default function GamesPage() {
  const { t, lang } = usePrefs();
  const { club } = useActiveClub();
  const data = useClubData(club?.id);
  const events = useAllEvents(club?.id) ?? [];
  const [filter, setFilter] = useState<"all" | "scheduled" | "final">("all");
  const [team, setTeam] = useState("");
  if (!club || !data) return null;

  const games = data.games.filter(
    (g) => (filter === "all" || (filter === "final" ? g.status === "final" : g.status !== "final")) && (!team || g.teamId === team),
  );

  return (
    <div>
      <PageHeader
        title={t("Partidos")}
        actions={
          <Link href="/games/new/" className="btn btn-primary">
            <Icon name="plus" /> {t("Nuevo")}
          </Link>
        }
      />
      <div className="flex gap-2 flex-wrap mb-4 items-center">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: t("Todos") },
            { value: "scheduled", label: t("Pendientes") },
            { value: "final", label: t("Finalizados") },
          ]}
        />
        {data.teams.length > 1 && (
          <select className="input !w-auto" value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">{t("Todos los equipos")}</option>
            {data.teams.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {games.length === 0 ? (
        <Empty title={t("Sin partidos")} action={<Link href="/games/new/" className="btn btn-primary">{t("Programar partido")}</Link>} />
      ) : (
        <div className="space-y-2">
          {games.map((g) => {
            const s = computeGame(g, events.filter((e) => e.gameId === g.id));
            const tm = data.teams.find((x) => x.id === g.teamId);
            const d = new Date(g.date);
            const won = s.score.us > s.score.them;
            return (
              <div key={g.id} className="card p-3 flex items-center gap-3">
                <div className="w-1.5 self-stretch rounded-full" style={{ background: tm?.color }} />
                <Link href={g.status === "final" ? `/game/?id=${g.id}` : `/game/live/?id=${g.id}`} className="flex-1 min-w-0">
                  <div className="font-bold truncate">
                    {tm?.name} {g.home ? "vs" : "@"} {g.opponentName}
                  </div>
                  <div className="muted text-xs">
                    {d.toLocaleDateString(lang, { weekday: "short", day: "numeric", month: "short" })} ·{" "}
                    {d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" })} · {g.format}
                    {g.competitionId ? ` · ${data.competitions.find((c) => c.id === g.competitionId)?.name ?? ""}` : ""}
                  </div>
                </Link>
                {g.status === "scheduled" ? (
                  <Link href={`/game/live/?id=${g.id}`} className="btn btn-primary">
                    <Icon name="play" /> {t("Anotar")}
                  </Link>
                ) : (
                  <Link href={g.status === "final" ? `/game/?id=${g.id}` : `/game/live/?id=${g.id}`} className="text-right">
                    <div className={`text-xl font-black tabular-nums ${g.status === "final" ? (won ? "text-ok" : s.score.us < s.score.them ? "text-bad" : "") : ""}`}>
                      {s.score.us}-{s.score.them}
                    </div>
                    <div className="text-[10px] font-bold muted uppercase">{g.status === "live" ? t("En vivo") : t("Final")}</div>
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
