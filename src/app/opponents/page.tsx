"use client";
import { useState } from "react";
import { can, roleOf, useActiveClub, useClubData } from "@/lib/hooks";
import { usePrefs } from "@/lib/prefs";
import { createOpponent, TEAM_COLORS } from "@/lib/factory";
import { patch, remove, uid } from "@/lib/db";
import { Avatar, Empty, Field, Icon, PageHeader, Sheet, confirmAsk } from "@/components/ui";
import type { Opponent } from "@/lib/types";

export default function OpponentsPage() {
  const { t } = usePrefs();
  const { club } = useActiveClub();
  const data = useClubData(club?.id);
  const [edit, setEdit] = useState<Opponent | null>(null);
  const [name, setName] = useState("");
  const [roster, setRoster] = useState("");
  if (!club || !data) return null;
  const editable = can.score(roleOf(club));

  const open = (o: Opponent) => {
    setEdit(o);
    setRoster(o.players.map((p) => `${p.number} ${p.name ?? ""}`.trim()).join("\n"));
  };

  const saveEdit = async () => {
    if (!edit) return;
    const lines = roster.split("\n").map((l) => l.trim()).filter(Boolean);
    const players = lines.map((l) => {
      const m = l.match(/^#?(\d{1,3})\s*(.*)$/);
      const number = m ? m[1] : l;
      const existing = edit.players.find((p) => p.number === number);
      return { id: existing?.id ?? uid(), number, name: m?.[2]?.trim() || undefined };
    });
    await patch<Opponent>("opponents", edit.id, { name: edit.name, shortName: edit.shortName, color: edit.color, players });
    setEdit(null);
  };

  return (
    <div>
      <PageHeader back="/club/" title={t("Rivales")} subtitle={t("Base reutilizable de equipos rivales")} />
      {editable && (
        <form
          className="flex gap-2 mb-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            await createOpponent(club.id, name);
            setName("");
          }}
        >
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Nombre del rival")} />
          <button className="btn btn-primary">
            <Icon name="plus" />
          </button>
        </form>
      )}
      {data.opponents.length === 0 && <Empty title={t("Sin rivales")} text={t("También se crean automáticamente al programar un partido.")} />}
      <div className="grid sm:grid-cols-2 gap-2">
        {data.opponents.map((o) => {
          const games = data.games.filter((g) => g.opponentId === o.id);
          return (
            <button key={o.id} className="card p-3 flex items-center gap-3 text-left" onClick={() => editable && open(o)}>
              <Avatar text={o.shortName} color={o.color} />
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{o.name}</div>
                <div className="muted text-xs">
                  {games.length} {t("partidos")} · {o.players.length} {t("jugadores registrados")}
                </div>
              </div>
              {editable && <Icon name="edit" className="w-4 h-4 muted" />}
            </button>
          );
        })}
      </div>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={t("Editar rival")}>
        {edit && (
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_90px] gap-2">
              <Field label={t("Nombre")}>
                <input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </Field>
              <Field label={t("Sigla")}>
                <input className="input" maxLength={4} value={edit.shortName} onChange={(e) => setEdit({ ...edit, shortName: e.target.value.toUpperCase() })} />
              </Field>
            </div>
            <div className="flex gap-2 flex-wrap">
              {TEAM_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setEdit({ ...edit, color: c })} className={`w-9 h-9 rounded-full border-4 ${edit.color === c ? "border-white" : "border-transparent"}`} style={{ background: c }} />
              ))}
            </div>
            <Field label={t("Jugadores del rival (opcional, uno por línea: número y nombre)")}>
              <textarea className="input font-mono" rows={8} value={roster} onChange={(e) => setRoster(e.target.value)} placeholder={"5 Pérez\n11 Gómez"} />
            </Field>
            <div className="flex gap-2">
              <button
                className="btn btn-danger"
                onClick={async () => {
                  if (confirmAsk(t("¿Eliminar rival?"))) {
                    await remove("opponents", edit.id);
                    setEdit(null);
                  }
                }}
              >
                <Icon name="trash" />
              </button>
              <button className="btn btn-primary flex-1" onClick={saveEdit}>
                {t("Guardar")}
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
