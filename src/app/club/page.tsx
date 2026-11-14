"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { can, roleOf, useActiveClub, useClubData, useSession } from "@/lib/hooks";
import { usePrefs } from "@/lib/prefs";
import { createClub, createTeam, TEAM_COLORS } from "@/lib/factory";
import { patch, remove, save, uid } from "@/lib/db";
import { cloudEnabled } from "@/lib/supabase";
import { createInvite, listMembers, setMemberRole } from "@/lib/sync";
import { Empty, Field, Icon, PageHeader, Segmented, Sheet, confirmAsk } from "@/components/ui";
import type { Club, Competition, Role, Season, Team } from "@/lib/types";

type Tab = "teams" | "seasons" | "competitions" | "members" | "club";

export default function ClubPage() {
  const { t, setClubId } = usePrefs();
  const { club } = useActiveClub();
  const data = useClubData(club?.id);
  const [tab, setTab] = useState<Tab>("teams");
  const [editTeam, setEditTeam] = useState<Partial<Team> | null>(null);
  const [editSeason, setEditSeason] = useState<Partial<Season> | null>(null);
  const [editComp, setEditComp] = useState<Partial<Competition> | null>(null);
  const [newClub, setNewClub] = useState(false);
  const role = roleOf(club);

  if (!club || !data) return <Empty title={t("Sin club")} action={<Link href="/" className="btn btn-primary">{t("Crear club")}</Link>} />;

  const saveTeam = async () => {
    if (!editTeam?.name) return;
    if (editTeam.id) await patch<Team>("teams", editTeam.id, editTeam);
    else await createTeam(club.id, editTeam.name, editTeam.category ?? "", editTeam.color ?? "#ff6a13", editTeam.seasonId);
    setEditTeam(null);
  };
  const saveSeason = async () => {
    if (!editSeason?.name) return;
    await save<Season>("seasons", { id: editSeason.id ?? uid(), clubId: club.id, name: editSeason.name, startDate: editSeason.startDate, endDate: editSeason.endDate, createdAt: editSeason.createdAt });
    setEditSeason(null);
  };
  const saveComp = async () => {
    if (!editComp?.name) return;
    await save<Competition>("competitions", { id: editComp.id ?? uid(), clubId: club.id, name: editComp.name, kind: editComp.kind ?? "league", seasonId: editComp.seasonId, createdAt: editComp.createdAt });
    setEditComp(null);
  };

  const tabs: { value: Tab; label: string }[] = [
    { value: "teams", label: t("Equipos") },
    { value: "seasons", label: t("Temporadas") },
    { value: "competitions", label: t("Ligas y torneos") },
    { value: "members", label: t("Miembros") },
    { value: "club", label: t("Club") },
  ];

  return (
    <div>
      <PageHeader
        title={club.name}
        subtitle={`${t("Rol")}: ${t(role)}`}
        actions={
          <Link href="/opponents/" className="btn">
            <Icon name="shield" /> <span className="hidden sm:inline">{t("Rivales")}</span>
          </Link>
        }
      />
      <div className="mb-4 overflow-x-auto no-scrollbar">
        <Segmented value={tab} options={tabs} onChange={setTab} />
      </div>

      {tab === "teams" && (
        <div className="space-y-3">
          {can.manageTeams(role) && (
            <button className="btn btn-primary" onClick={() => setEditTeam({ color: "#ff6a13", category: "Mayores" })}>
              <Icon name="plus" /> {t("Nuevo equipo")}
            </button>
          )}
          {data.teams.length === 0 && <Empty title={t("Sin equipos todavía")} />}
          <div className="grid sm:grid-cols-2 gap-3">
            {data.teams.map((tm) => {
              const n = data.players.filter((p) => p.teamId === tm.id).length;
              const season = data.seasons.find((s) => s.id === tm.seasonId);
              return (
                <div key={tm.id} className="card p-4 flex items-center gap-3">
                  <div className="w-3 self-stretch rounded-full" style={{ background: tm.color }} />
                  <Link href={`/team/?id=${tm.id}`} className="flex-1 min-w-0">
                    <div className="font-extrabold text-lg truncate">{tm.name}</div>
                    <div className="muted text-sm">
                      {tm.category} · {n} {t("jugadores")}
                      {season ? ` · ${season.name}` : ""}
                    </div>
                  </Link>
                  {can.manageTeams(role) && (
                    <button className="btn btn-ghost !px-2" onClick={() => setEditTeam(tm)} aria-label={t("Editar")}>
                      <Icon name="edit" />
                    </button>
                  )}
                  <Link href={`/team/?id=${tm.id}`} className="btn">
                    {t("Plantilla")}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "seasons" && (
        <div className="space-y-3">
          {can.manageTeams(role) && (
            <button className="btn btn-primary" onClick={() => setEditSeason({ name: `${new Date().getFullYear()}` })}>
              <Icon name="plus" /> {t("Nueva temporada")}
            </button>
          )}
          {data.seasons.length === 0 && <div className="muted text-sm">{t("Sin temporadas. Son opcionales y sirven para filtrar estadísticas.")}</div>}
          {data.seasons.map((s) => (
            <div key={s.id} className="card p-4 flex items-center gap-3">
              <div className="flex-1">
                <div className="font-bold">{s.name}</div>
                <div className="muted text-sm">
                  {s.startDate ?? "…"} → {s.endDate ?? "…"} · {data.games.filter((g) => g.seasonId === s.id).length} {t("partidos")}
                </div>
              </div>
              {can.manageTeams(role) && (
                <button className="btn btn-ghost !px-2" onClick={() => setEditSeason(s)}>
                  <Icon name="edit" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "competitions" && (
        <div className="space-y-3">
          {can.manageTeams(role) && (
            <button className="btn btn-primary" onClick={() => setEditComp({ kind: "league", seasonId: data.seasons[0]?.id })}>
              <Icon name="plus" /> {t("Nueva liga o torneo")}
            </button>
          )}
          {data.competitions.map((c) => {
            const games = data.games.filter((g) => g.competitionId === c.id).sort((a, b) => a.date.localeCompare(b.date));
            return (
              <div key={c.id} className="card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1">
                    <div className="font-bold">{c.name}</div>
                    <div className="muted text-xs">
                      {t(c.kind === "league" ? "Liga" : c.kind === "tournament" ? "Torneo" : "Amistoso")} · {data.seasons.find((s) => s.id === c.seasonId)?.name ?? ""}
                    </div>
                  </div>
                  <Link href={`/games/new/?competition=${c.id}`} className="btn">
                    <Icon name="plus" /> {t("Partido")}
                  </Link>
                  {can.manageTeams(role) && (
                    <button className="btn btn-ghost !px-2" onClick={() => setEditComp(c)}>
                      <Icon name="edit" />
                    </button>
                  )}
                </div>
                <div className="text-sm space-y-1">
                  {games.length === 0 && <div className="muted">{t("Calendario vacío")}</div>}
                  {games.map((g) => (
                    <Link key={g.id} href={g.status === "final" ? `/game/?id=${g.id}` : `/game/live/?id=${g.id}`} className="flex gap-2 py-1 border-t border-line">
                      <span className="muted w-28 shrink-0">{g.date.replace("T", " ")}</span>
                      <span className="flex-1 truncate">{data.teams.find((x) => x.id === g.teamId)?.name} {g.home ? "vs" : "@"} {g.opponentName}</span>
                      <span className="chip">{t(g.status === "final" ? "Final" : g.status === "live" ? "En vivo" : "Programado")}</span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "members" && <Members clubId={club.id} role={role} />}

      {tab === "club" && (
        <div className="card p-4 space-y-4 max-w-lg">
          <Field label={t("Nombre del club")}>
            <input className="input" defaultValue={club.name} disabled={!can.manageClub(role)} onBlur={(e) => e.target.value.trim() && patch<Club>("clubs", club.id, { name: e.target.value.trim() })} />
          </Field>
          <Field label={t("Ciudad")}>
            <input className="input" defaultValue={club.city} disabled={!can.manageClub(role)} onBlur={(e) => patch<Club>("clubs", club.id, { city: e.target.value })} />
          </Field>
          <div className="flex gap-2 flex-wrap">
            <button className="btn" onClick={() => setNewClub(true)}>
              <Icon name="plus" /> {t("Crear otro club")}
            </button>
            {can.manageClub(role) && (
              <button
                className="btn btn-danger"
                onClick={async () => {
                  if (confirmAsk(t("¿Eliminar el club? Se ocultará con todos sus datos."))) {
                    await remove("clubs", club.id);
                    setClubId(null);
                  }
                }}
              >
                <Icon name="trash" /> {t("Eliminar club")}
              </button>
            )}
          </div>
        </div>
      )}

      <Sheet open={!!editTeam} onClose={() => setEditTeam(null)} title={editTeam?.id ? t("Editar equipo") : t("Nuevo equipo")}>
        {editTeam && (
          <div className="space-y-3">
            <Field label={t("Nombre")}>
              <input className="input" value={editTeam.name ?? ""} onChange={(e) => setEditTeam({ ...editTeam, name: e.target.value })} autoFocus />
            </Field>
            <Field label={t("Categoría")}>
              <input className="input" value={editTeam.category ?? ""} onChange={(e) => setEditTeam({ ...editTeam, category: e.target.value })} />
            </Field>
            <Field label={t("Temporada")}>
              <select className="input" value={editTeam.seasonId ?? ""} onChange={(e) => setEditTeam({ ...editTeam, seasonId: e.target.value || undefined })}>
                <option value="">—</option>
                {data.seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <div>
              <span className="label">{t("Color")}</span>
              <div className="flex gap-2 flex-wrap">
                {TEAM_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setEditTeam({ ...editTeam, color: c })} className={`w-10 h-10 rounded-full border-4 ${editTeam.color === c ? "border-white" : "border-transparent"}`} style={{ background: c }} aria-label={c} />
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              {editTeam.id && (
                <button
                  className="btn btn-danger"
                  onClick={async () => {
                    if (confirmAsk(t("¿Eliminar equipo?"))) {
                      await remove("teams", editTeam.id!);
                      setEditTeam(null);
                    }
                  }}
                >
                  <Icon name="trash" />
                </button>
              )}
              <button className="btn btn-primary flex-1" onClick={saveTeam}>
                {t("Guardar")}
              </button>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={!!editSeason} onClose={() => setEditSeason(null)} title={t("Temporada")}>
        {editSeason && (
          <div className="space-y-3">
            <Field label={t("Nombre")}>
              <input className="input" value={editSeason.name ?? ""} onChange={(e) => setEditSeason({ ...editSeason, name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("Inicio")}>
                <input type="date" className="input" value={editSeason.startDate ?? ""} onChange={(e) => setEditSeason({ ...editSeason, startDate: e.target.value })} />
              </Field>
              <Field label={t("Fin")}>
                <input type="date" className="input" value={editSeason.endDate ?? ""} onChange={(e) => setEditSeason({ ...editSeason, endDate: e.target.value })} />
              </Field>
            </div>
            <div className="flex gap-2">
              {editSeason.id && (
                <button className="btn btn-danger" onClick={async () => { await remove("seasons", editSeason.id!); setEditSeason(null); }}>
                  <Icon name="trash" />
                </button>
              )}
              <button className="btn btn-primary flex-1" onClick={saveSeason}>
                {t("Guardar")}
              </button>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={!!editComp} onClose={() => setEditComp(null)} title={t("Liga o torneo")}>
        {editComp && (
          <div className="space-y-3">
            <Field label={t("Nombre")}>
              <input className="input" value={editComp.name ?? ""} onChange={(e) => setEditComp({ ...editComp, name: e.target.value })} />
            </Field>
            <Segmented
              value={editComp.kind ?? "league"}
              onChange={(k) => setEditComp({ ...editComp, kind: k })}
              options={[
                { value: "league", label: t("Liga") },
                { value: "tournament", label: t("Torneo") },
                { value: "friendly", label: t("Amistoso") },
              ]}
            />
            <Field label={t("Temporada")}>
              <select className="input" value={editComp.seasonId ?? ""} onChange={(e) => setEditComp({ ...editComp, seasonId: e.target.value || undefined })}>
                <option value="">—</option>
                {data.seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex gap-2">
              {editComp.id && (
                <button className="btn btn-danger" onClick={async () => { await remove("competitions", editComp.id!); setEditComp(null); }}>
                  <Icon name="trash" />
                </button>
              )}
              <button className="btn btn-primary flex-1" onClick={saveComp}>
                {t("Guardar")}
              </button>
            </div>
          </div>
        )}
      </Sheet>

      <NewClubSheet open={newClub} onClose={() => setNewClub(false)} />
    </div>
  );
}

function NewClubSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, setClubId } = usePrefs();
  const [name, setName] = useState("");
  return (
    <Sheet open={open} onClose={onClose} title={t("Nuevo club")}>
      <div className="space-y-3">
        <Field label={t("Nombre del club")}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <button
          className="btn btn-primary w-full"
          onClick={async () => {
            if (!name.trim()) return;
            const c = await createClub(name);
            setClubId(c.id);
            setName("");
            onClose();
          }}
        >
          {t("Crear")}
        </button>
      </div>
    </Sheet>
  );
}

const ROLES: Role[] = ["admin", "coach", "scorer", "player", "fan"];

function Members({ clubId, role }: { clubId: string; role: Role }) {
  const { t } = usePrefs();
  const { session } = useSession();
  const [members, setMembers] = useState<{ user_id: string; role: string; email: string | null }[]>([]);
  const [inviteRole, setInviteRole] = useState<Role>("scorer");
  const [code, setCode] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (session) listMembers(clubId).then(setMembers);
  }, [clubId, session]);

  if (!cloudEnabled)
    return (
      <Empty
        title={t("Modo local")}
        text={t("Para invitar entrenadores, anotadores, jugadores y aficionados configura Supabase (ver README) e inicia sesión.")}
      />
    );
  if (!session) return <Empty title={t("Inicia sesión para gestionar miembros")} action={<Link href="/login/" className="btn btn-primary">{t("Iniciar sesión")}</Link>} />;

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div className="font-bold">{t("Invitar al club")}</div>
        <p className="muted text-sm">{t("Genera un código y compártelo. La otra persona lo ingresa en Ajustes → Unirme a un club.")}</p>
        <div className="flex gap-2 flex-wrap items-center">
          <select className="input !w-auto" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>
            {ROLES.filter((r) => role === "admin" || r !== "admin").map((r) => (
              <option key={r} value={r}>
                {t(r)}
              </option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            disabled={!can.manageTeams(role)}
            onClick={async () => {
              setErr(null);
              try {
                setCode(await createInvite(clubId, inviteRole));
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
          >
            {t("Generar código")}
          </button>
          {code && <span className="text-2xl font-black tracking-widest text-brand select-all">{code}</span>}
        </div>
        {err && <div className="text-bad text-sm">{err}</div>}
      </div>
      <div className="card divide-y divide-[var(--line)]">
        {members.map((m) => (
          <div key={m.user_id} className="p-3 flex items-center gap-3">
            <div className="flex-1 truncate">{m.email ?? m.user_id.slice(0, 8)}</div>
            {role === "admin" && m.user_id !== session.user.id ? (
              <select
                className="input !w-auto"
                value={m.role}
                onChange={async (e) => {
                  await setMemberRole(clubId, m.user_id, e.target.value as Role);
                  setMembers(await listMembers(clubId));
                }}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(r)}
                  </option>
                ))}
              </select>
            ) : (
              <span className="chip">{t(m.role)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
