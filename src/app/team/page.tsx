"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { can, roleOf, useActiveClub, useClubData, useQueryParam } from "@/lib/hooks";
import { usePrefs } from "@/lib/prefs";
import { createPlayer } from "@/lib/factory";
import { patch, remove } from "@/lib/db";
import { Avatar, Empty, Field, Icon, PageHeader, Segmented, Sheet, confirmAsk, resizeImage } from "@/components/ui";
import type { Player, PlayerStatus, Position } from "@/lib/types";

const POSITIONS: Position[] = ["PG", "SG", "SF", "PF", "C", ""];

function TeamInner() {
  const id = useQueryParam("id");
  const { t } = usePrefs();
  const { club } = useActiveClub();
  const data = useClubData(club?.id);
  const [edit, setEdit] = useState<Partial<Player> | null>(null);
  const [bulk, setBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const role = roleOf(club);

  if (!data || !club) return null;
  const team = data.teams.find((x) => x.id === id);
  if (!team) return <Empty title={t("Equipo no encontrado")} action={<Link href="/club/" className="btn">{t("Volver")}</Link>} />;
  const players = data.players.filter((p) => p.teamId === team.id);
  const editable = can.manageTeams(role);

  const savePlayer = async () => {
    if (!edit) return;
    if (!edit.firstName?.trim() && !edit.number?.trim()) return;
    const base = {
      clubId: club.id,
      teamId: team.id,
      firstName: edit.firstName?.trim() ?? "",
      lastName: edit.lastName?.trim() ?? "",
      number: edit.number?.trim() ?? "",
      position: (edit.position ?? "") as Position,
      status: (edit.status ?? "active") as PlayerStatus,
      photo: edit.photo,
      birthYear: edit.birthYear,
    };
    if (edit.id) await patch<Player>("players", edit.id, base);
    else await createPlayer(base);
    setEdit(null);
  };

  const importBulk = async () => {
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    for (const l of lines) {
      const m = l.match(/^#?(\d{1,3})\s*[-.,]?\s*(.*)$/);
      const number = m ? m[1] : "";
      const name = (m ? m[2] : l).trim();
      const [firstName, ...rest] = name.split(/\s+/);
      await createPlayer({ clubId: club.id, teamId: team.id, number, firstName: firstName ?? "", lastName: rest.join(" "), position: "", status: "active" });
    }
    setBulkText("");
    setBulk(false);
  };

  const statusColor: Record<PlayerStatus, string> = { active: "text-ok", injured: "text-bad", inactive: "muted" };

  return (
    <div>
      <PageHeader
        back="/club/"
        title={team.name}
        subtitle={`${team.category} · ${players.length} ${t("jugadores")}`}
        actions={
          editable && (
            <>
              <button className="btn" onClick={() => setBulk(true)}>
                <Icon name="list" /> <span className="hidden sm:inline">{t("Carga rápida")}</span>
              </button>
              <button className="btn btn-primary" onClick={() => setEdit({ status: "active", position: "" })}>
                <Icon name="plus" /> <span className="hidden sm:inline">{t("Jugador")}</span>
              </button>
            </>
          )
        }
      />
      {players.length === 0 ? (
        <Empty
          title={t("Plantilla vacía")}
          text={t("Agrega jugadores uno por uno o pega la lista completa con Carga rápida.")}
          action={editable && <button className="btn btn-primary" onClick={() => setBulk(true)}>{t("Carga rápida")}</button>}
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {players.map((p) => (
            <div key={p.id} className="card p-3 flex items-center gap-3">
              <Avatar photo={p.photo} text={p.number || "?"} color={team.color} size={48} />
              <Link href={`/player/?id=${p.id}`} className="flex-1 min-w-0">
                <div className="font-bold truncate">
                  <span className="text-brand">#{p.number}</span> {p.firstName} {p.lastName}
                </div>
                <div className="text-xs">
                  <span className="muted">{p.position || "—"}</span> · <span className={statusColor[p.status]}>{t(p.status === "active" ? "Activo" : p.status === "injured" ? "Lesionado" : "Inactivo")}</span>
                </div>
              </Link>
              {editable && (
                <button className="btn btn-ghost !px-2" onClick={() => setEdit(p)} aria-label={t("Editar")}>
                  <Icon name="edit" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex gap-2 flex-wrap">
        <Link href={`/games/new/?team=${team.id}`} className="btn btn-primary">
          <Icon name="ball" /> {t("Nuevo partido con este equipo")}
        </Link>
        <Link href={`/stats/?team=${team.id}`} className="btn">
          <Icon name="chart" /> {t("Estadísticas del equipo")}
        </Link>
      </div>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? t("Editar jugador") : t("Nuevo jugador")}>
        {edit && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Avatar photo={edit.photo} text={edit.number || "?"} color={team.color} size={64} />
              <label className="btn">
                <Icon name="user" /> {t("Foto")}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) setEdit({ ...edit, photo: await resizeImage(f) });
                  }}
                />
              </label>
              {edit.photo && (
                <button className="btn btn-ghost" onClick={() => setEdit({ ...edit, photo: undefined })}>
                  {t("Quitar")}
                </button>
              )}
            </div>
            <div className="grid grid-cols-[90px_1fr] gap-2">
              <Field label={t("Número")}>
                <input className="input text-center font-black" inputMode="numeric" value={edit.number ?? ""} onChange={(e) => setEdit({ ...edit, number: e.target.value })} autoFocus />
              </Field>
              <Field label={t("Nombre")}>
                <input className="input" value={edit.firstName ?? ""} onChange={(e) => setEdit({ ...edit, firstName: e.target.value })} />
              </Field>
            </div>
            <Field label={t("Apellido")}>
              <input className="input" value={edit.lastName ?? ""} onChange={(e) => setEdit({ ...edit, lastName: e.target.value })} />
            </Field>
            <div>
              <span className="label">{t("Posición")}</span>
              <Segmented value={(edit.position ?? "") as Position} onChange={(v) => setEdit({ ...edit, position: v })} options={POSITIONS.map((p) => ({ value: p, label: p || "—" }))} />
            </div>
            <div>
              <span className="label">{t("Estado")}</span>
              <Segmented
                value={(edit.status ?? "active") as PlayerStatus}
                onChange={(v) => setEdit({ ...edit, status: v })}
                options={[
                  { value: "active", label: t("Activo") },
                  { value: "injured", label: t("Lesionado") },
                  { value: "inactive", label: t("Inactivo") },
                ]}
              />
            </div>
            <Field label={t("Año de nacimiento")}>
              <input className="input" inputMode="numeric" value={edit.birthYear ?? ""} onChange={(e) => setEdit({ ...edit, birthYear: Number(e.target.value) || undefined })} />
            </Field>
            <div className="flex gap-2 pt-2">
              {edit.id && (
                <button
                  className="btn btn-danger"
                  onClick={async () => {
                    if (confirmAsk(t("¿Eliminar jugador?"))) {
                      await remove("players", edit.id!);
                      setEdit(null);
                    }
                  }}
                >
                  <Icon name="trash" />
                </button>
              )}
              <button className="btn btn-primary flex-1" onClick={savePlayer}>
                {t("Guardar")}
              </button>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={bulk} onClose={() => setBulk(false)} title={t("Carga rápida de plantilla")}>
        <p className="muted text-sm mb-2">{t("Un jugador por línea: número y nombre. Ej: 7 Juan Pérez")}</p>
        <textarea className="input font-mono" rows={10} value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={"4 Martín Gómez\n7 Lucas Díaz\n10 Tomás Ruiz"} />
        <button className="btn btn-primary w-full mt-3" onClick={importBulk}>
          {t("Agregar jugadores")}
        </button>
      </Sheet>
    </div>
  );
}

export default function TeamPage() {
  return (
    <Suspense>
      <TeamInner />
    </Suspense>
  );
}
