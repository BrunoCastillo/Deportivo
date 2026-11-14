"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { can, roleOf, useActiveClub, useClubData } from "@/lib/hooks";
import { usePrefs } from "@/lib/prefs";
import { db, remove, save, saveMany, uid } from "@/lib/db";
import { STARTER_DRILLS } from "@/lib/factory";
import { Empty, Field, Icon, PageHeader, Segmented, Sheet, confirmAsk } from "@/components/ui";
import type { Drill, Training } from "@/lib/types";

export default function TrainingsPage() {
  const { t, lang } = usePrefs();
  const { club } = useActiveClub();
  const data = useClubData(club?.id);
  const drills = useLiveQuery(async () => (club ? (await db.drills.where("clubId").equals(club.id).toArray()).filter((d) => !d.deleted) : []), [club?.id]);
  const trainings = useLiveQuery(
    async () => (club ? (await db.trainings.where("clubId").equals(club.id).toArray()).filter((d) => !d.deleted).sort((a, b) => b.date.localeCompare(a.date)) : []),
    [club?.id],
  );
  const [tab, setTab] = useState<"plans" | "drills">("plans");
  const [drill, setDrill] = useState<Partial<Drill> | null>(null);
  const [plan, setPlan] = useState<Partial<Training> | null>(null);
  const [cat, setCat] = useState("");

  if (!club || !data || !drills || !trainings) return null;
  const editable = can.manageTeams(roleOf(club));
  const cats = [...new Set(drills.map((d) => d.category))].sort();

  const saveDrill = async () => {
    if (!drill?.name) return;
    await save<Drill>("drills", {
      id: drill.id ?? uid(),
      clubId: club.id,
      name: drill.name,
      category: drill.category || "General",
      minutes: drill.minutes ?? 10,
      players: drill.players,
      description: drill.description ?? "",
      createdAt: drill.createdAt,
    });
    setDrill(null);
  };
  const savePlan = async () => {
    if (!plan?.teamId || !plan.date) return;
    const items = plan.items ?? [];
    await save<Training>("trainings", {
      id: plan.id ?? uid(),
      clubId: club.id,
      teamId: plan.teamId,
      date: plan.date,
      focus: plan.focus ?? "",
      items,
      minutes: items.reduce((a, i) => a + i.minutes, 0),
      attendance: plan.attendance ?? [],
      notes: plan.notes,
      createdAt: plan.createdAt,
    });
    setPlan(null);
  };

  const teamPlayers = data.players.filter((p) => p.teamId === plan?.teamId);

  return (
    <div>
      <PageHeader
        title={t("Entrenamientos")}
        actions={
          editable &&
          (tab === "plans" ? (
            <button
              className="btn btn-primary"
              disabled={!data.teams.length}
              onClick={() => setPlan({ teamId: data.teams[0]?.id, date: new Date().toISOString().slice(0, 16), items: [], attendance: [] })}
            >
              <Icon name="plus" /> {t("Planificar")}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setDrill({ minutes: 10, category: cat || "Tiro" })}>
              <Icon name="plus" /> {t("Ejercicio")}
            </button>
          ))
        }
      />
      <div className="mb-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "plans", label: t("Sesiones") },
            { value: "drills", label: `${t("Biblioteca")} (${drills.length})` },
          ]}
        />
      </div>

      {tab === "plans" && (
        <div className="space-y-2">
          {trainings.length === 0 && <Empty title={t("Sin sesiones planificadas")} text={t("Arma sesiones con ejercicios de tu biblioteca y registra la asistencia.")} />}
          {trainings.map((tr) => {
            const tm = data.teams.find((x) => x.id === tr.teamId);
            return (
              <button key={tr.id} className="card p-3 w-full text-left flex gap-3 items-center" onClick={() => editable && setPlan(tr)}>
                <div className="text-center w-14 shrink-0">
                  <div className="muted text-xs uppercase">{new Date(tr.date).toLocaleDateString(lang, { month: "short" })}</div>
                  <div className="text-xl font-black">{new Date(tr.date).getDate()}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{tr.focus || t("Entrenamiento")}</div>
                  <div className="muted text-xs">
                    {tm?.name} · {tr.minutes} min · {tr.items.length} {t("ejercicios")} · {tr.attendance.length} {t("presentes")}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {tab === "drills" && (
        <div className="space-y-3">
          {drills.length === 0 && (
            <Empty
              title={t("Biblioteca vacía")}
              text={t("Crea tus propios ejercicios o carga algunos de ejemplo para empezar.")}
              action={
                editable && (
                  <button
                    className="btn btn-primary"
                    onClick={() =>
                      saveMany<Drill>(
                        "drills",
                        STARTER_DRILLS.map((d) => ({ ...d, id: uid(), clubId: club.id, createdAt: Date.now(), updatedAt: Date.now() })),
                      )
                    }
                  >
                    {t("Cargar ejemplos")}
                  </button>
                )
              }
            />
          )}
          {cats.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              <button className={`chip ${!cat ? "!bg-brand text-black" : ""}`} onClick={() => setCat("")}>
                {t("Todas")}
              </button>
              {cats.map((c) => (
                <button key={c} className={`chip ${cat === c ? "!bg-brand text-black" : ""}`} onClick={() => setCat(c)}>
                  {c}
                </button>
              ))}
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-2">
            {drills
              .filter((d) => !cat || d.category === cat)
              .map((d) => (
                <button key={d.id} className="card p-3 text-left" onClick={() => editable && setDrill(d)}>
                  <div className="flex items-center gap-2">
                    <div className="font-bold flex-1">{d.name}</div>
                    <span className="chip">{d.minutes}′</span>
                  </div>
                  <div className="text-xs text-brand font-semibold">
                    {d.category}
                    {d.players ? ` · ${d.players}` : ""}
                  </div>
                  <p className="muted text-sm mt-1 line-clamp-3">{d.description}</p>
                </button>
              ))}
          </div>
        </div>
      )}

      <Sheet open={!!drill} onClose={() => setDrill(null)} title={drill?.id ? t("Editar ejercicio") : t("Nuevo ejercicio")}>
        {drill && (
          <div className="space-y-3">
            <Field label={t("Nombre")}>
              <input className="input" value={drill.name ?? ""} onChange={(e) => setDrill({ ...drill, name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-[1fr_90px] gap-2">
              <Field label={t("Categoría")}>
                <input className="input" list="drill-cats" value={drill.category ?? ""} onChange={(e) => setDrill({ ...drill, category: e.target.value })} />
                <datalist id="drill-cats">
                  {["Calentamiento", "Tiro", "Defensa", "Transición", "Táctica", "Físico", ...cats].map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
              <Field label={t("Minutos")}>
                <input type="number" className="input" value={drill.minutes ?? 10} onChange={(e) => setDrill({ ...drill, minutes: Number(e.target.value) || 0 })} />
              </Field>
            </div>
            <Field label={t("Jugadores / organización")}>
              <input className="input" value={drill.players ?? ""} onChange={(e) => setDrill({ ...drill, players: e.target.value })} />
            </Field>
            <Field label={t("Descripción")}>
              <textarea className="input" rows={5} value={drill.description ?? ""} onChange={(e) => setDrill({ ...drill, description: e.target.value })} />
            </Field>
            <div className="flex gap-2">
              {drill.id && (
                <button className="btn btn-danger" onClick={async () => { if (confirmAsk(t("¿Eliminar ejercicio?"))) { await remove("drills", drill.id!); setDrill(null); } }}>
                  <Icon name="trash" />
                </button>
              )}
              <button className="btn btn-primary flex-1" onClick={saveDrill}>
                {t("Guardar")}
              </button>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={!!plan} onClose={() => setPlan(null)} title={t("Sesión de entrenamiento")} wide>
        {plan && (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-3 gap-2">
              <Field label={t("Equipo")}>
                <select className="input" value={plan.teamId} onChange={(e) => setPlan({ ...plan, teamId: e.target.value, attendance: [] })}>
                  {data.teams.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("Fecha y hora")}>
                <input type="datetime-local" className="input" value={plan.date} onChange={(e) => setPlan({ ...plan, date: e.target.value })} />
              </Field>
              <Field label={t("Objetivo")}>
                <input className="input" value={plan.focus ?? ""} onChange={(e) => setPlan({ ...plan, focus: e.target.value })} placeholder={t("Ej: defensa del bloqueo directo")} />
              </Field>
            </div>
            <div>
              <div className="label">
                {t("Ejercicios")} · {(plan.items ?? []).reduce((a, i) => a + i.minutes, 0)} min
              </div>
              <div className="space-y-1">
                {(plan.items ?? []).map((it, i) => {
                  const d = drills.find((x) => x.id === it.drillId);
                  return (
                    <div key={i} className="flex items-center gap-2 surface-2 rounded-xl p-2">
                      <span className="font-black w-6 text-center muted">{i + 1}</span>
                      <span className="flex-1 truncate font-semibold">{d?.name ?? "?"}</span>
                      <input
                        type="number"
                        className="input !w-20 !min-h-[36px]"
                        value={it.minutes}
                        onChange={(e) => {
                          const items = [...(plan.items ?? [])];
                          items[i] = { ...it, minutes: Number(e.target.value) || 0 };
                          setPlan({ ...plan, items });
                        }}
                      />
                      <button className="btn btn-ghost !px-2 !min-h-[36px]" onClick={() => setPlan({ ...plan, items: (plan.items ?? []).filter((_, j) => j !== i) })}>
                        <Icon name="x" className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <select
                className="input mt-2"
                value=""
                onChange={(e) => {
                  const d = drills.find((x) => x.id === e.target.value);
                  if (d) setPlan({ ...plan, items: [...(plan.items ?? []), { drillId: d.id, minutes: d.minutes }] });
                }}
              >
                <option value="">{drills.length ? t("+ Agregar ejercicio de la biblioteca") : t("Crea ejercicios en la Biblioteca")}</option>
                {drills.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.category} · {d.name} ({d.minutes}′)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="label">
                {t("Asistencia")} ({plan.attendance?.length ?? 0}/{teamPlayers.length})
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
                {teamPlayers.map((p) => {
                  const on = plan.attendance?.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      className={`rounded-xl border-2 px-2 py-1.5 text-sm text-left truncate ${on ? "border-ok" : "border-line opacity-60"}`}
                      onClick={() => setPlan({ ...plan, attendance: on ? plan.attendance!.filter((x) => x !== p.id) : [...(plan.attendance ?? []), p.id] })}
                    >
                      {on ? "✓" : "○"} #{p.number} {p.lastName || p.firstName}
                    </button>
                  );
                })}
              </div>
            </div>
            <Field label={t("Notas")}>
              <textarea className="input" value={plan.notes ?? ""} onChange={(e) => setPlan({ ...plan, notes: e.target.value })} />
            </Field>
            <div className="flex gap-2">
              {plan.id && (
                <button className="btn btn-danger" onClick={async () => { if (confirmAsk(t("¿Eliminar sesión?"))) { await remove("trainings", plan.id!); setPlan(null); } }}>
                  <Icon name="trash" />
                </button>
              )}
              <button className="btn btn-primary flex-1" onClick={savePlan}>
                {t("Guardar")}
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
