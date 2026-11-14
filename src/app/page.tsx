"use client";
import Link from "next/link";
import { useState } from "react";
import { useActiveClub, useAllEvents, useClubData } from "@/lib/hooks";
import { usePrefs } from "@/lib/prefs";
import { createClub, createTeam } from "@/lib/factory";
import { computeGame } from "@/lib/stats";
import { Empty, Field, Icon } from "@/components/ui";
import { Logo } from "@/components/AppShell";
import type { Game, GameEvent } from "@/lib/types";

function Onboarding() {
  const { t, setClubId } = usePrefs();
  const [club, setClub] = useState("");
  const [team, setTeam] = useState("");
  const [cat, setCat] = useState("Mayores");
  const [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!club.trim()) return;
    setBusy(true);
    const c = await createClub(club);
    setClubId(c.id);
    const tm = await createTeam(c.id, team.trim() || club.trim(), cat);
    window.location.href = `/team/?id=${tm.id}`;
  };
  return (
    <div className="max-w-md mx-auto pt-6">
      <div className="flex items-center gap-3 mb-6">
        <Logo size={48} />
        <div>
          <div className="text-3xl font-black tracking-tight">Rebote</div>
          <div className="muted text-sm">{t("Estadísticas de básquet en vivo")}</div>
        </div>
      </div>
      <form onSubmit={go} className="card p-5 space-y-4">
        <div className="font-extrabold text-lg">{t("Empecemos con tu club")}</div>
        <Field label={t("Nombre del club")}>
          <input className="input" value={club} onChange={(e) => setClub(e.target.value)} placeholder="Club Atlético Ejemplo" required autoFocus />
        </Field>
        <Field label={t("Primer equipo")}>
          <input className="input" value={team} onChange={(e) => setTeam(e.target.value)} placeholder={t("Ej: Primera masculino")} />
        </Field>
        <Field label={t("Categoría")}>
          <input className="input" value={cat} onChange={(e) => setCat(e.target.value)} list="cats" />
          <datalist id="cats">
            {["Mini", "Sub-12", "Sub-14", "Sub-16", "Sub-18", "Sub-21", "Mayores", "Veteranos"].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <button className="btn btn-primary w-full" disabled={busy}>
          {t("Crear club y cargar plantilla")}
        </button>
        <p className="muted text-xs">{t("Todo se guarda en tu dispositivo y funciona sin internet. Puedes iniciar sesión luego para sincronizar y compartir.")}</p>
      </form>
      <button
        className="btn w-full mt-3"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const { loadDemo } = await import("@/lib/demo");
          setClubId(await loadDemo());
          setBusy(false);
        }}
      >
        <Icon name="ball" /> {t("Ver con datos de demostración")}
      </button>
      <div className="text-center mt-4">
        <Link href="/settings/" className="text-sm text-brand font-semibold">
          {t("¿Ya tienes cuenta o un código de invitación?")}
        </Link>
      </div>
    </div>
  );
}

function GameRow({ g, events, teamName }: { g: Game; events: GameEvent[]; teamName: string }) {
  const { t, lang } = usePrefs();
  const s = computeGame(g, events);
  const d = new Date(g.date);
  const res = s.score.us > s.score.them ? "W" : s.score.us < s.score.them ? "L" : "";
  const href = g.status === "scheduled" || g.status === "live" ? `/game/live/?id=${g.id}` : `/game/?id=${g.id}`;
  return (
    <Link href={href} className="card p-3 flex items-center gap-3 hover:border-brand">
      <div className="text-center w-12 shrink-0">
        <div className="text-xs muted uppercase">{d.toLocaleDateString(lang, { month: "short" })}</div>
        <div className="text-xl font-black">{d.getDate()}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold truncate">
          {teamName} {g.home ? "vs" : "@"} {g.opponentName}
        </div>
        <div className="text-xs muted">
          {g.format} · {d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" })}
          {g.venue ? ` · ${g.venue}` : ""}
        </div>
      </div>
      {g.status === "scheduled" ? (
        <span className="chip">{t("Programado")}</span>
      ) : (
        <div className="text-right">
          <div className="text-xl font-black tabular-nums">
            {s.score.us}-{s.score.them}
          </div>
          {g.status === "live" ? (
            <span className="chip !bg-red-500 !border-red-500 text-white">{t("EN VIVO")}</span>
          ) : (
            res && <span className={`text-xs font-black ${res === "W" ? "text-ok" : "text-bad"}`}>{res === "W" ? t("Ganado") : t("Perdido")}</span>
          )}
        </div>
      )}
    </Link>
  );
}

export default function Home() {
  const { t } = usePrefs();
  const { club, loading } = useActiveClub();
  const data = useClubData(club?.id);
  const events = useAllEvents(club?.id) ?? [];

  if (loading) return null;
  if (!club) return <Onboarding />;
  if (!data) return null;

  const teamName = (id: string) => data.teams.find((x) => x.id === id)?.name ?? "";
  const live = data.games.filter((g) => g.status === "live");
  const upcoming = data.games.filter((g) => g.status === "scheduled").sort((a, b) => a.date.localeCompare(b.date));
  const recent = data.games.filter((g) => g.status === "final").slice(0, 5);
  const evBy = (id: string) => events.filter((e) => e.gameId === id);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="muted text-sm">{t("Hola")} 👋</div>
          <h1 className="text-3xl font-black tracking-tight">{club.name}</h1>
        </div>
        <Link href="/games/new/" className="btn btn-primary">
          <Icon name="plus" /> {t("Nuevo partido")}
        </Link>
      </div>

      {data.teams.length === 0 ? (
        <Empty title={t("Crea tu primer equipo")} action={<Link className="btn btn-primary" href="/club/">{t("Ir al club")}</Link>} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { href: "/club/", label: t("Equipos"), value: data.teams.length, icon: "team" },
            { href: "/club/", label: t("Jugadores"), value: data.players.length, icon: "user" },
            { href: "/games/", label: t("Partidos"), value: data.games.length, icon: "ball" },
            { href: "/opponents/", label: t("Rivales"), value: data.opponents.length, icon: "shield" },
          ].map((c) => (
            <Link key={c.label} href={c.href} className="card p-4 hover:border-brand">
              <Icon name={c.icon} className="w-5 h-5 text-brand" />
              <div className="text-3xl font-black mt-1">{c.value}</div>
              <div className="muted text-sm font-semibold">{c.label}</div>
            </Link>
          ))}
        </div>
      )}

      {live.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-extrabold text-lg">{t("En vivo")}</h2>
          {live.map((g) => (
            <GameRow key={g.id} g={g} events={evBy(g.id)} teamName={teamName(g.teamId)} />
          ))}
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-extrabold text-lg">{t("Próximos partidos")}</h2>
          <Link href="/games/" className="text-sm text-brand font-semibold">
            {t("Ver todos")}
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <div className="muted text-sm">{t("No hay partidos programados.")}</div>
        ) : (
          upcoming.slice(0, 4).map((g) => <GameRow key={g.id} g={g} events={[]} teamName={teamName(g.teamId)} />)
        )}
      </section>

      {recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-extrabold text-lg">{t("Últimos resultados")}</h2>
          {recent.map((g) => (
            <GameRow key={g.id} g={g} events={evBy(g.id)} teamName={teamName(g.teamId)} />
          ))}
        </section>
      )}
    </div>
  );
}
