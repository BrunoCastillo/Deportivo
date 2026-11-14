"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useActiveClub, useClubData, useQueryParam } from "@/lib/hooks";
import { usePrefs } from "@/lib/prefs";
import { createGame, createOpponent, formatDefaults } from "@/lib/factory";
import { Avatar, Empty, Field, Icon, PageHeader, Segmented } from "@/components/ui";
import type { DetailLevel, GameFormat } from "@/lib/types";

function localDT(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function NewGameInner() {
  const { t } = usePrefs();
  const router = useRouter();
  const qTeam = useQueryParam("team");
  const qComp = useQueryParam("competition");
  const { club } = useActiveClub();
  const data = useClubData(club?.id);
  const [teamId, setTeamId] = useState("");
  const [oppId, setOppId] = useState("");
  const [oppName, setOppName] = useState("");
  const [date, setDate] = useState(localDT());
  const [venue, setVenue] = useState("");
  const [home, setHome] = useState(true);
  const [format, setFormat] = useState<GameFormat>("5x5");
  const [detail, setDetail] = useState<DetailLevel>("advanced");
  const [periods, setPeriods] = useState(4);
  const [periodMinutes, setPeriodMinutes] = useState(10);
  const [otMinutes, setOtMinutes] = useState(5);
  const [competitionId, setCompetitionId] = useState("");
  const [roster, setRoster] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    const tid = teamId || qTeam || data.teams[0]?.id || "";
    if (tid !== teamId) setTeamId(tid);
    if (qComp && !competitionId) setCompetitionId(qComp);
  }, [data, qTeam, qComp, teamId, competitionId]);

  useEffect(() => {
    if (!data || !teamId) return;
    setRoster(data.players.filter((p) => p.teamId === teamId && p.status === "active").map((p) => p.id));
  }, [teamId, data?.players.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const d = formatDefaults(format);
    setPeriods(d.periods);
    setPeriodMinutes(d.periodMinutes);
    setOtMinutes(d.otMinutes);
  }, [format]);

  if (!club || !data) return null;
  if (data.teams.length === 0) return <Empty title={t("Primero crea un equipo")} action={<Link href="/club/" className="btn btn-primary">{t("Ir al club")}</Link>} />;

  const players = data.players.filter((p) => p.teamId === teamId);
  const team = data.teams.find((x) => x.id === teamId);
  const maxRoster = format === "3x3" ? 4 : 15;

  const submit = async (startNow: boolean) => {
    if (!teamId) return;
    let opponentId = oppId || undefined;
    let opponentName = data.opponents.find((o) => o.id === oppId)?.name ?? oppName.trim();
    if (!opponentId && opponentName) {
      const o = await createOpponent(club.id, opponentName);
      opponentId = o.id;
    }
    if (!opponentName) opponentName = t("Rival");
    setBusy(true);
    const comp = data.competitions.find((c) => c.id === competitionId);
    const g = await createGame({
      clubId: club.id,
      teamId,
      opponentId,
      opponentName,
      date,
      venue,
      home,
      format,
      detail,
      periods,
      periodMinutes,
      otMinutes,
      competitionId: competitionId || undefined,
      seasonId: comp?.seasonId ?? team?.seasonId,
      rosterIds: roster,
    });
    router.push(startNow ? `/game/live/?id=${g.id}` : "/games/");
  };

  return (
    <div className="max-w-2xl">
      <PageHeader back="/games/" title={t("Nuevo partido")} />
      <div className="space-y-4">
        <div className="card p-4 space-y-3">
          <Field label={t("Equipo")}>
            <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              {data.teams.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} · {x.category}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("Rival")}>
            <select className="input" value={oppId} onChange={(e) => setOppId(e.target.value)}>
              <option value="">{t("+ Nuevo rival…")}</option>
              {data.opponents.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          {!oppId && <input className="input" value={oppName} onChange={(e) => setOppName(e.target.value)} placeholder={t("Nombre del rival")} />}
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("Fecha y hora")}>
              <input type="datetime-local" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label={t("Cancha / lugar")}>
              <input className="input" value={venue} onChange={(e) => setVenue(e.target.value)} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            <Segmented value={home ? "h" : "a"} onChange={(v) => setHome(v === "h")} options={[{ value: "h", label: t("Local") }, { value: "a", label: t("Visitante") }]} />
            {data.competitions.length > 0 && (
              <select className="input !w-auto" value={competitionId} onChange={(e) => setCompetitionId(e.target.value)}>
                <option value="">{t("Sin competición")}</option>
                {data.competitions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="card p-4 space-y-3">
          <div className="flex flex-wrap gap-4">
            <div>
              <span className="label">{t("Formato")}</span>
              <Segmented value={format} onChange={setFormat} options={[{ value: "5x5", label: "5x5" }, { value: "3x3", label: "3x3" }]} />
            </div>
            <div>
              <span className="label">{t("Nivel de detalle")}</span>
              <Segmented
                value={detail}
                onChange={setDetail}
                options={[
                  { value: "basic", label: t("Básico") },
                  { value: "advanced", label: t("Avanzado") },
                  { value: "pro", label: t("Pro") },
                ]}
              />
            </div>
          </div>
          <p className="muted text-xs">
            {detail === "basic" && t("Básico: un toque por acción, sin ubicación de tiro ni preguntas. Ideal para anotar solo.")}
            {detail === "advanced" && t("Avanzado: ubicación del tiro en la cancha y preguntas automáticas de asistencia, rebote y tiros libres.")}
            {detail === "pro" && t("Pro: todo lo anterior más tipo de pérdida (pasos, dobles…), tipo de falta, tapones recibidos y jugadores rivales.")}
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Field label={t("Periodos")}>
              <input type="number" min={1} max={8} className="input" value={periods} onChange={(e) => setPeriods(Number(e.target.value) || 1)} />
            </Field>
            <Field label={t("Minutos por periodo")}>
              <input type="number" min={1} max={30} className="input" value={periodMinutes} onChange={(e) => setPeriodMinutes(Number(e.target.value) || 1)} />
            </Field>
            <Field label={t("Min. prórroga")}>
              <input type="number" min={0} max={10} className="input" value={otMinutes} onChange={(e) => setOtMinutes(Number(e.target.value) || 0)} />
            </Field>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center mb-2">
            <div className="font-bold flex-1">
              {t("Convocados")} ({roster.length})
            </div>
            <button className="text-sm text-brand font-semibold" onClick={() => setRoster(roster.length ? [] : players.map((p) => p.id))}>
              {roster.length ? t("Ninguno") : t("Todos")}
            </button>
          </div>
          {roster.length > maxRoster && <div className="text-amber-500 text-xs mb-2">{t("Atención: más de {n} convocados.", { n: maxRoster })}</div>}
          {players.length === 0 && (
            <div className="muted text-sm">
              {t("Este equipo no tiene jugadores.")}{" "}
              <Link className="text-brand" href={`/team/?id=${teamId}`}>
                {t("Cargar plantilla")}
              </Link>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {players.map((p) => {
              const on = roster.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setRoster(on ? roster.filter((x) => x !== p.id) : [...roster, p.id])}
                  className={`flex items-center gap-2 p-2 rounded-xl border-2 text-left ${on ? "border-brand" : "border-line opacity-60"}`}
                >
                  <Avatar photo={p.photo} text={p.number} color={team?.color} size={32} />
                  <span className="text-sm font-semibold truncate">
                    {p.firstName} {p.lastName}
                    {p.status === "injured" && " 🩹"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-2">
          <button className="btn flex-1" disabled={busy} onClick={() => submit(false)}>
            <Icon name="calendar" /> {t("Programar")}
          </button>
          <button className="btn btn-primary flex-1" disabled={busy} onClick={() => submit(true)}>
            <Icon name="play" /> {t("Ir a anotar")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NewGamePage() {
  return (
    <Suspense>
      <NewGameInner />
    </Suspense>
  );
}
