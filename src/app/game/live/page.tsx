"use client";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { can, roleOf, useGame, useNow, useOnline, useQueryParam, type GameBundle } from "@/lib/hooks";
import { usePrefs } from "@/lib/prefs";
import { db, deviceId, patch, remove, save, uid } from "@/lib/db";
import {
  bonusInfo,
  computeGame,
  currentClockMs,
  elapsedMs,
  fmtClock,
  fouledOut,
  periodLabel,
  periodLengthMs,
  reb,
  timeoutsLeft,
  eff,
  fmtMin,
  type GameStats,
} from "@/lib/stats";
import { describeEvent, TOV_LABEL } from "@/lib/describe";
import { publishLive, subscribeGame } from "@/lib/sync";
import { cloudEnabled } from "@/lib/supabase";
import { Court } from "@/components/Court";
import { Avatar, Empty, Field, Icon, Sheet, confirmAsk } from "@/components/ui";
import type { EventType, Game, GameEvent, Player, TeamSide, TovKind } from "@/lib/types";

// ---------- Preguntas encadenadas (flujos tipo "¿quién asistió?") ----------
interface Option<T> {
  label: string;
  value: T;
  tone?: "brand" | "rival" | "ok" | "bad" | "muted";
  sub?: string;
}
type Prompt =
  | { kind: "options"; title: string; options: Option<unknown>[]; cols?: number; resolve: (v: unknown) => void }
  | { kind: "court"; title: string; color: string; resolve: (v: unknown) => void };

type ActionKey =
  | "2m"
  | "2x"
  | "3m"
  | "3x"
  | "1m"
  | "1x"
  | "oreb"
  | "dreb"
  | "ast"
  | "stl"
  | "blk"
  | "tov"
  | "foul"
  | "fd"
  | "tovf";

const toneCls: Record<NonNullable<Option<unknown>["tone"]>, string> = {
  brand: "bg-brand text-black border-brand",
  rival: "bg-rival text-black border-rival",
  ok: "bg-ok text-black border-ok",
  bad: "bg-bad text-white border-bad",
  muted: "",
};

function LiveInner() {
  const id = useQueryParam("id");
  const bundle = useGame(id);
  const { t } = usePrefs();
  if (bundle === undefined) return <div className="p-6 muted">{t("Cargando…")}</div>;
  if (!bundle)
    return (
      <div className="p-4">
        <Empty title={t("Partido no encontrado")} action={<Link href="/games/" className="btn">{t("Volver")}</Link>} />
      </div>
    );
  return <Scorer bundle={bundle} />;
}

function Scorer({ bundle }: { bundle: GameBundle }) {
  const { game, events, players, opponent, team } = bundle;
  const { t, lang } = usePrefs();
  const online = useOnline();
  const now = useNow(200, game.clock.running);
  const clockMs = currentClockMs(game.clock, now);
  const nowElapsed = elapsedMs(game, game.clock.period, clockMs);
  const stats = useMemo(() => computeGame(game, events, nowElapsed), [game, events, nowElapsed]);
  const is3 = game.format === "3x3";
  const pv = (n: number) => (is3 ? n - 1 : n); // valor de tiro según formato
  const detail = game.detail;
  const roster = useMemo(
    () => game.rosterIds.map((rid) => players.find((p) => p.id === rid)).filter(Boolean) as Player[],
    [game.rosterIds, players],
  );
  const lineupTracked = stats.onCourt.length > 0;
  const onCourt = lineupTracked ? roster.filter((p) => stats.onCourt.includes(p.id)) : roster;
  const bench = roster.filter((p) => !stats.onCourt.includes(p.id));
  const club = useClubRole(game.clubId);
  const canScore = can.score(club);

  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<ActionKey | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [sheet, setSheet] = useState<null | "subs" | "starters" | "log" | "box" | "menu" | "clock" | "edit">(null);
  const [editEv, setEditEv] = useState<Partial<GameEvent> | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dos anotadores: tiempo real
  useEffect(() => subscribeGame(game.id), [game.id]);

  // Marcador público
  useEffect(() => {
    if (!game.publicLive) return;
    publishLive(game.id, game.clubId, {
      us: team?.name ?? "",
      them: game.opponentName,
      usColor: team?.color,
      themColor: opponent?.color,
      score: stats.score,
      byPeriod: stats.byPeriod,
      period: game.clock.period,
      periods: game.periods,
      clock: game.clock,
      status: game.status,
      fouls: bonusInfo(game, stats, game.clock.period),
      top: Object.entries(stats.players)
        .map(([pid, s]) => {
          const p = players.find((x) => x.id === pid);
          return { n: p?.number, name: `${p?.firstName ?? ""} ${p?.lastName ?? ""}`.trim(), pts: s.pts, reb: reb(s), ast: s.ast };
        })
        .sort((a, b) => b.pts - a.pts),
      format: game.format,
    });
  }, [game.publicLive, stats.score.us, stats.score.them, game.clock, game.status, events.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fin de periodo automático
  useEffect(() => {
    if (game.clock.running && clockMs <= 0) {
      void patch<Game>("games", game.id, { clock: { ...game.clock, running: false, remainingMs: 0, startedAt: undefined } });
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }
  }, [clockMs, game.clock, game.id]);

  // Pedir titulares al abrir
  useEffect(() => {
    if (game.status !== "final" && game.starterIds.length === 0 && roster.length >= (is3 ? 3 : 5) && events.length === 0 && canScore) setSheet("starters");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const flash = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  // ---------- helpers ----------
  const ask = useCallback(<T,>(title: string, options: Option<T>[], cols?: number) => {
    return new Promise<T | null>((resolve) =>
      setPrompt({ kind: "options", title, options: options as Option<unknown>[], cols, resolve: resolve as (v: unknown) => void }),
    );
  }, []);
  const askCourt = useCallback((title: string, color: string) => {
    return new Promise<{ x: number; y: number } | null>((resolve) => setPrompt({ kind: "court", title, color, resolve: resolve as (v: unknown) => void }));
  }, []);
  const answer = (v: unknown) => {
    const p = prompt;
    setPrompt(null);
    p?.resolve(v);
  };

  const add = async (ev: Partial<GameEvent> & { type: EventType; team: TeamSide }, at: { period: number; clockMs: number }) => {
    const full = await save<GameEvent>("events", {
      id: uid(),
      clubId: game.clubId,
      gameId: game.id,
      period: at.period,
      clockMs: at.clockMs,
      device: deviceId(),
      ...ev,
    } as GameEvent);
    if (game.status === "scheduled") await patch<Game>("games", game.id, { status: "live" });
    return full;
  };

  const pname = (id?: string | null) => {
    const p = players.find((x) => x.id === id);
    return p ? `#${p.number} ${p.lastName || p.firstName}` : t("Equipo");
  };
  const ourOptions = (excludeId?: string, tone: Option<string>["tone"] = "brand"): Option<string>[] =>
    onCourt.filter((p) => p.id !== excludeId).map((p) => ({ label: `#${p.number}`, sub: p.lastName || p.firstName, value: p.id, tone }));
  const rivalPlayerOptions = (): Option<string>[] => (opponent?.players ?? []).map((p) => ({ label: `#${p.number}`, sub: p.name, value: p.id, tone: "rival" }));
  const askRivalPlayer = async (title: string) => {
    if (detail !== "pro" || !opponent?.players.length) return undefined;
    const r = await ask<string>(title, [...rivalPlayerOptions(), { label: t("Sin identificar"), value: "", tone: "muted" }], 4);
    return r || undefined;
  };

  const askRebound = async (shooterSide: TeamSide, at: { period: number; clockMs: number }, parentId: string) => {
    if (detail === "basic") return;
    const ourType = shooterSide === "us" ? "oreb" : "dreb";
    const theirType = shooterSide === "us" ? "dreb" : "oreb";
    const r = await ask<string>(
      t("¿Rebote?"),
      [
        ...ourOptions(undefined, "brand"),
        { label: t("Equipo"), sub: t(shooterSide === "us" ? "Rebote ofensivo" : "Rebote defensivo"), value: "__us", tone: "brand" },
        { label: opponent?.shortName ?? t("Rival"), sub: t(shooterSide === "us" ? "Rebote defensivo" : "Rebote ofensivo"), value: "__them", tone: "rival" },
        { label: t("Ninguno"), value: "__none", tone: "muted" },
      ],
      4,
    );
    if (!r || r === "__none") return;
    if (r === "__them") {
      const rp = await askRivalPlayer(t("¿Qué rival tomó el rebote?"));
      await add({ team: "them", type: theirType, playerId: rp, parentId }, at);
      flash(`${t("Rebote")} ${opponent?.shortName ?? t("Rival")}`);
    } else {
      await add({ team: "us", type: ourType, playerId: r === "__us" ? undefined : r, parentId }, at);
      flash(`${t("Rebote")} ${pname(r === "__us" ? null : r)}`);
    }
  };

  const ftSequence = async (side: TeamSide, playerId: string | undefined, n: number, at: { period: number; clockMs: number }, parentId: string) => {
    let lastMade = true;
    for (let i = 1; i <= n; i++) {
      const r = await ask<"m" | "x">(`${t("Tiro libre")} ${i}/${n} · ${side === "us" ? pname(playerId) : opponent?.shortName ?? t("Rival")}`, [
        { label: `✓ ${t("Anotado")}`, value: "m", tone: "ok" },
        { label: `✗ ${t("Fallado")}`, value: "x", tone: "bad" },
      ]);
      if (!r) return;
      await add({ team: side, type: "ft", playerId, made: r === "m", points: 1, parentId }, at);
      lastMade = r === "m";
    }
    if (!lastMade) await askRebound(side, at, parentId);
  };

  const askFtCount = () =>
    ask<number>(t("¿Tiros libres?"), [
      { label: t("Sin tiros"), value: 0, tone: "muted" },
      { label: "1", value: 1 },
      { label: "2", value: 2 },
      { label: "3", value: 3 },
    ]);

  // ---------- acciones propias ----------
  const doAction = async (action: ActionKey, playerId: string) => {
    if (!canScore) return;
    const at = { period: game.clock.period, clockMs };
    setSelected(null);
    setPending(null);
    const name = pname(playerId);
    switch (action) {
      case "2m":
      case "2x":
      case "3m":
      case "3x": {
        const three = action[0] === "3";
        const made = action[1] === "m";
        let loc: { x: number; y: number } | null = null;
        if (detail !== "basic") loc = await askCourt(`${name} · ${t("¿Desde dónde?")}`, "#ff6a13");
        const shot = await add(
          { team: "us", type: three ? "shot3" : "shot2", playerId, made, points: pv(three ? 3 : 2), x: loc?.x, y: loc?.y },
          at,
        );
        flash(`${name} ${made ? "+" + pv(three ? 3 : 2) : t("falla")}`);
        if (detail === "basic") return;
        if (made) {
          const a = await ask<string>(t("¿Asistencia?"), [...ourOptions(playerId), { label: t("Sin asistencia"), value: "", tone: "muted" }], 4);
          if (a) {
            await add({ team: "us", type: "ast", playerId: a, parentId: shot.id }, at);
            flash(`${t("Asistencia")} ${pname(a)}`);
          }
        } else {
          if (detail === "pro") {
            const b = await ask<string>(t("¿Taponado?"), [
              { label: t("No"), value: "no", tone: "muted" },
              ...(opponent?.players.length ? rivalPlayerOptions() : [{ label: t("Sí"), value: "", tone: "rival" as const }]),
            ], 4);
            if (b !== null && b !== "no") {
              await patch<GameEvent>("events", shot.id, { blockedBy: true });
              await add({ team: "them", type: "blk", playerId: b || undefined, parentId: shot.id }, at);
            }
          }
          await askRebound("us", at, shot.id);
        }
        return;
      }
      case "1m":
      case "1x": {
        const made = action === "1m";
        const ev = await add({ team: "us", type: "ft", playerId, made, points: 1 }, at);
        flash(`${name} ${made ? t("TL +1") : t("TL fallado")}`);
        if (!made) await askRebound("us", at, ev.id);
        return;
      }
      case "oreb":
      case "dreb":
        await add({ team: "us", type: action, playerId }, at);
        flash(`${name} · ${action === "oreb" ? t("Rebote ofensivo") : t("Rebote defensivo")}`);
        return;
      case "ast":
        await add({ team: "us", type: "ast", playerId }, at);
        flash(`${name} · ${t("Asistencia")}`);
        return;
      case "stl": {
        const ev = await add({ team: "us", type: "stl", playerId }, at);
        const rp = await askRivalPlayer(t("¿A quién le robó?"));
        await add({ team: "them", type: "tov", playerId: rp, parentId: ev.id }, at);
        flash(`${name} · ${t("Robo")}`);
        return;
      }
      case "tovf": {
        const ev = await add({ team: "us", type: "tov_forced", playerId }, at);
        await add({ team: "them", type: "tov", parentId: ev.id }, at);
        flash(`${name} · ${t("Pérdida forzada")}`);
        return;
      }
      case "blk": {
        const ev = await add({ team: "us", type: "blk", playerId }, at);
        const rp = await askRivalPlayer(t("¿A quién taponó?"));
        const shot = await add({ team: "them", type: "shot2", made: false, blockedBy: true, points: pv(2), playerId: rp, parentId: ev.id }, at);
        flash(`${name} · ${t("Tapón")}`);
        await askRebound("them", at, shot.id);
        return;
      }
      case "tov": {
        let kind: TovKind | undefined;
        if (detail === "pro") {
          kind =
            (await ask<TovKind>(
              t("¿Tipo de pérdida?"),
              (Object.keys(TOV_LABEL) as TovKind[]).map((k) => ({ label: t(TOV_LABEL[k]), value: k })),
              2,
            )) ?? undefined;
        }
        const ev = await add({ team: "us", type: "tov", playerId, tov: kind }, at);
        if (kind === "offensive_foul") {
          await add({ team: "us", type: "foul", playerId, parentId: ev.id }, at);
          await add({ team: "them", type: "foul_drawn", parentId: ev.id }, at);
        }
        if (detail !== "basic" && kind !== "offensive_foul") {
          const s = await ask<string>(t("¿Robo del rival?"), [
            { label: t("No"), value: "no", tone: "muted" },
            ...(detail === "pro" && opponent?.players.length ? rivalPlayerOptions() : [{ label: t("Sí"), value: "", tone: "rival" as const }]),
          ], 4);
          if (s !== null && s !== "no") await add({ team: "them", type: "stl", playerId: s || undefined, parentId: ev.id }, at);
        }
        flash(`${name} · ${t("Pérdida")}`);
        return;
      }
      case "foul": {
        let type: EventType = "foul";
        if (detail !== "basic") {
          const r = await ask<EventType | "off">(
            t("¿Tipo de falta?"),
            [
              { label: t("Personal"), value: "foul", tone: "brand" },
              { label: t("En ataque"), value: "off" },
              { label: t("Técnica"), value: "foul_tech" },
              { label: t("Antideportiva"), value: "foul_unsp", tone: "bad" },
            ],
            2,
          );
          if (r === null) return;
          if (r === "off") {
            const ev = await add({ team: "us", type: "foul", playerId }, at);
            await add({ team: "us", type: "tov", playerId, tov: "offensive_foul", parentId: ev.id }, at);
            await add({ team: "them", type: "foul_drawn", parentId: ev.id }, at);
            flash(`${name} · ${t("Falta en ataque")}`);
            return;
          }
          type = r;
        }
        const ev = await add({ team: "us", type, playerId }, at);
        flash(`${name} · ${t("Falta")}`);
        const pl = players.find((p) => p.id === playerId);
        const after = computeGame(game, [...events, ev]).players[playerId];
        if (after && fouledOut(game, after)) flash(`⚠️ ${pl ? `#${pl.number}` : ""} ${t("eliminado por faltas")}`);
        if (detail === "basic") return;
        const rp = await askRivalPlayer(t("¿A qué rival?"));
        if (rp) await add({ team: "them", type: "foul_drawn", playerId: rp, parentId: ev.id }, at);
        const n = await askFtCount();
        if (n) {
          await patch<GameEvent>("events", ev.id, { ftCount: n });
          await ftSequence("them", rp, n, at, ev.id);
        }
        return;
      }
      case "fd": {
        const ev = await add({ team: "us", type: "foul_drawn", playerId }, at);
        await add({ team: "them", type: "foul", parentId: ev.id }, at);
        flash(`${name} · ${t("Falta recibida")}`);
        if (detail === "basic") return;
        const n = await askFtCount();
        if (n) await ftSequence("us", playerId, n, at, ev.id);
        return;
      }
    }
  };

  // ---------- acciones del rival ----------
  const rivalAction = async (k: "2m" | "2x" | "3m" | "3x" | "1m" | "1x" | "oreb" | "dreb" | "tov" | "stl" | "foul" | "to") => {
    if (!canScore) return;
    const at = { period: game.clock.period, clockMs };
    const opp = opponent?.shortName ?? t("Rival");
    if (k === "to") {
      await add({ team: "them", type: "timeout" }, at);
      if (game.clock.running) await toggleClock();
      flash(`${t("Tiempo muerto")} ${opp}`);
      return;
    }
    if (k === "2m" || k === "2x" || k === "3m" || k === "3x") {
      const three = k[0] === "3";
      const made = k[1] === "m";
      let loc: { x: number; y: number } | null = null;
      if (detail === "pro") loc = await askCourt(`${opp} · ${t("¿Desde dónde?")}`, "#2bb3ff");
      const rp = await askRivalPlayer(t("¿Qué rival?"));
      const shot = await add({ team: "them", type: three ? "shot3" : "shot2", made, points: pv(three ? 3 : 2), playerId: rp, x: loc?.x, y: loc?.y }, at);
      flash(`${opp} ${made ? "+" + pv(three ? 3 : 2) : t("falla")}`);
      if (!made) await askRebound("them", at, shot.id);
      return;
    }
    if (k === "1m" || k === "1x") {
      const ev = await add({ team: "them", type: "ft", made: k === "1m", points: 1 }, at);
      flash(`${opp} ${k === "1m" ? t("TL +1") : t("TL fallado")}`);
      if (k === "1x") await askRebound("them", at, ev.id);
      return;
    }
    if (k === "oreb" || k === "dreb") {
      const rp = await askRivalPlayer(t("¿Qué rival?"));
      await add({ team: "them", type: k, playerId: rp }, at);
      flash(`${opp} · ${t("Rebote")}`);
      return;
    }
    if (k === "tov") {
      await add({ team: "them", type: "tov" }, at);
      flash(`${opp} · ${t("Pérdida")}`);
      return;
    }
    if (k === "stl") {
      const who = await ask<string>(t("¿Quién la perdió?"), [...ourOptions(undefined, "brand"), { label: t("Equipo"), value: "", tone: "muted" }], 4);
      if (who === null) return;
      const ev = await add({ team: "us", type: "tov", playerId: who || undefined }, at);
      await add({ team: "them", type: "stl", parentId: ev.id }, at);
      flash(`${t("Robo")} ${opp}`);
      return;
    }
    if (k === "foul") {
      const rp = await askRivalPlayer(t("¿Qué rival hizo la falta?"));
      const who = await ask<string>(t("¿A quién le hicieron la falta?"), [...ourOptions(undefined, "brand"), { label: t("Nadie / equipo"), value: "", tone: "muted" }], 4);
      if (who === null) return;
      const ev = await add({ team: "them", type: "foul", playerId: rp }, at);
      if (who) await add({ team: "us", type: "foul_drawn", playerId: who, parentId: ev.id }, at);
      flash(`${t("Falta")} ${opp}`);
      if (detail === "basic") return;
      const n = await askFtCount();
      if (n) {
        await patch<GameEvent>("events", ev.id, { ftCount: n });
        await ftSequence("us", who || undefined, n, at, ev.id);
      }
    }
  };

  // ---------- reloj ----------
  const toggleClock = async () => {
    if (!canScore) return;
    const c = game.clock;
    if (c.running) {
      await patch<Game>("games", game.id, { clock: { ...c, running: false, remainingMs: currentClockMs(c), startedAt: undefined } });
    } else {
      if (c.remainingMs <= 0) return;
      await patch<Game>("games", game.id, { status: game.status === "scheduled" ? "live" : game.status, clock: { ...c, running: true, startedAt: Date.now() } });
    }
  };
  const nextPeriod = async () => {
    const p = game.clock.period;
    const lastReg = p >= game.periods;
    if (lastReg && stats.score.us !== stats.score.them) {
      if (confirmAsk(t("¿Finalizar el partido?"))) await finish();
      return;
    }
    if (lastReg && game.otMinutes <= 0) {
      if (confirmAsk(t("Empate y sin prórroga configurada. ¿Finalizar el partido?"))) await finish();
      return;
    }
    await add({ team: "us", type: "period_end" }, { period: p, clockMs: 0 });
    const np = p + 1;
    await patch<Game>("games", game.id, { clock: { period: np, remainingMs: periodLengthMs(game, np), running: false } });
    flash(`${t("Comienza")} ${periodLabel(game, np, lang)}`);
  };
  const finish = async () => {
    await patch<Game>("games", game.id, { status: "final", clock: { ...game.clock, running: false, remainingMs: currentClockMs(game.clock), startedAt: undefined } });
    window.location.href = `/game/?id=${game.id}`;
  };

  // ---------- deshacer ----------
  const undo = async () => {
    const mine = [...bundle.allEvents].filter((e) => !e.deleted && e.type !== "period_end").sort((a, b) => b.createdAt - a.createdAt);
    const last = mine.find((e) => e.device === deviceId()) ?? mine[0];
    if (!last) return;
    await remove("events", last.id);
    for (const child of mine.filter((e) => e.parentId === last.id)) await remove("events", child.id);
    flash(`${t("Deshecho")}: ${describeEvent(last, players, opponent, lang, is3)}`);
  };

  // ---------- selección / arrastre ----------
  const tapPlayer = (pid: string) => {
    if (pending) {
      void doAction(pending, pid);
      return;
    }
    setSelected(selected === pid ? null : pid);
  };
  const tapAction = (a: ActionKey) => {
    if (selected) void doAction(a, selected);
    else if (onCourt.length === 1) void doAction(a, onCourt[0].id);
    else setPending(pending === a ? null : a);
  };

  const drag = useRef<{ pid: string; x: number; y: number; moved: boolean } | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; label: string } | null>(null);
  const onPlayerPointerDown = (e: React.PointerEvent, p: Player) => {
    drag.current = { pid: p.id, x: e.clientX, y: e.clientY, moved: false };
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) d.moved = true;
      if (d.moved) {
        const p = players.find((x) => x.id === d.pid);
        setGhost({ x: e.clientX, y: e.clientY, label: `#${p?.number ?? ""}` });
      }
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      setGhost(null);
      if (!d) return;
      if (!d.moved) {
        tapPlayer(d.pid);
        return;
      }
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-action]") as HTMLElement | null;
      if (el?.dataset.action) void doAction(el.dataset.action as ActionKey, d.pid);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  });

  // ---------- render ----------
  const bonus = bonusInfo(game, stats, game.clock.period);
  const toUs = timeoutsLeft(game, stats, "us", game.clock.period);
  const toThem = timeoutsLeft(game, stats, "them", game.clock.period);
  const periodOver = !game.clock.running && clockMs <= 0;

  const actions: { k: ActionKey; label: string; sub?: string; tone: string; show: boolean }[] = [
    { k: "2m", label: `${pv(2)} ✓`, sub: t("Anotado"), tone: "bg-ok text-black", show: true },
    { k: "3m", label: `${pv(3)} ✓`, sub: t("Anotado"), tone: "bg-ok text-black", show: true },
    { k: "1m", label: "TL ✓", sub: t("Libre"), tone: "bg-ok text-black", show: true },
    { k: "ast", label: "AST", sub: t("Asist."), tone: "surface-2", show: true },
    { k: "2x", label: `${pv(2)} ✗`, sub: t("Fallado"), tone: "bg-bad text-white", show: true },
    { k: "3x", label: `${pv(3)} ✗`, sub: t("Fallado"), tone: "bg-bad text-white", show: true },
    { k: "1x", label: "TL ✗", sub: t("Libre"), tone: "bg-bad text-white", show: true },
    { k: "oreb", label: "REB O", sub: t("Ofens."), tone: "surface-2", show: true },
    { k: "stl", label: "ROB", sub: t("Robo"), tone: "surface-2", show: true },
    { k: "blk", label: "TAP", sub: t("Tapón"), tone: "surface-2", show: true },
    { k: "tov", label: "PÉR", sub: t("Pérdida"), tone: "surface-2", show: true },
    { k: "dreb", label: "REB D", sub: t("Defens."), tone: "surface-2", show: true },
    { k: "foul", label: "FALTA", sub: t("Cometida"), tone: "bg-amber-400 text-black", show: true },
    { k: "fd", label: "F. REC", sub: t("Recibida"), tone: "surface-2", show: detail !== "basic" },
    { k: "tovf", label: "P. FORZ", sub: t("Forzada"), tone: "surface-2", show: detail === "pro" },
  ];

  const pClock = fmtClock(clockMs);

  return (
    <div className="min-h-dvh flex flex-col select-none" style={{ background: "var(--bg)" }}>
      {/* ---------- marcador ---------- */}
      <header className="safe-top sticky top-0 z-20 border-b border-line" style={{ background: "var(--surface)" }}>
        <div className="flex items-center gap-1 px-2 h-12">
          <Link href={game.status === "final" ? `/game/?id=${game.id}` : "/games/"} className="btn btn-ghost !px-2 !min-h-[40px]" aria-label={t("Volver")}>
            <Icon name="back" />
          </Link>
          <div className="flex-1 truncate text-sm font-bold">
            {team?.name} <span className="muted">vs</span> {game.opponentName}
          </div>
          {!online && <Icon name="wifiOff" className="w-4 h-4 text-amber-500" />}
          {game.publicLive && <span className="chip !bg-red-500 !border-red-500 text-white !text-[10px]">LIVE</span>}
          <button className="btn btn-ghost !px-2 !min-h-[40px]" onClick={() => setSheet("menu")} aria-label={t("Menú")}>
            <Icon name="menu" />
          </button>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center px-3 pb-2 gap-2">
          <div className="text-center">
            <div className="text-5xl font-black tabular-nums leading-none text-brand">{stats.score.us}</div>
            <div className="text-[11px] font-bold muted mt-1">
              {t("F")}: <span className={bonus.us >= bonus.limit ? "text-bad" : ""}>{bonus.us}</span> · TM: {toUs}
            </div>
          </div>
          <button
            onClick={() => (periodOver ? nextPeriod() : toggleClock())}
            onContextMenu={(e) => {
              e.preventDefault();
              setSheet("clock");
            }}
            className={`rounded-2xl px-4 py-1.5 text-center min-w-[128px] border-2 ${game.clock.running ? "border-ok" : periodOver ? "border-brand" : "border-line"}`}
            aria-label={t("Reloj")}
          >
            <div className="text-[11px] font-black muted">{periodLabel(game, game.clock.period, lang)}</div>
            <div className={`text-3xl font-black tabular-nums leading-tight ${game.clock.running ? "text-ok" : ""}`}>{pClock}</div>
            <div className="text-[10px] font-bold muted">{periodOver ? t("Siguiente periodo ›") : game.clock.running ? t("Tocar para parar") : t("Tocar para iniciar")}</div>
          </button>
          <div className="text-center">
            <div className="text-5xl font-black tabular-nums leading-none text-rival">{stats.score.them}</div>
            <div className="text-[11px] font-bold muted mt-1">
              {t("F")}: <span className={bonus.them >= bonus.limit ? "text-bad" : ""}>{bonus.them}</span> · TM: {toThem}
            </div>
          </div>
        </div>
      </header>

      {!canScore && <div className="p-3 text-center text-sm bg-amber-500/15 text-amber-500">{t("Tu rol es de solo lectura en este club.")}</div>}

      <div className="flex-1 grid md:grid-cols-2 gap-3 p-3 max-w-5xl w-full mx-auto">
        {/* ---------- jugadores ---------- */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold muted uppercase">
              {pending ? `${t("Elige jugador para")}: ${actions.find((a) => a.k === pending)?.label}` : lineupTracked ? t("En cancha") : t("Convocados")}
            </div>
            <div className="flex gap-1">
              {lineupTracked ? (
                <button className="btn !min-h-[34px] !px-3 text-sm" onClick={() => setSheet("subs")}>
                  <Icon name="swap" className="w-4 h-4" /> {t("Cambios")}
                </button>
              ) : (
                <button className="btn !min-h-[34px] !px-3 text-sm" onClick={() => setSheet("starters")}>
                  {t("Elegir titulares")}
                </button>
              )}
            </div>
          </div>
          {roster.length === 0 && <Empty title={t("Sin convocados")} text={t("Edita el partido desde el menú para agregar jugadores.")} />}
          <div className={`grid gap-2 ${onCourt.length > 6 ? "grid-cols-4" : onCourt.length > 3 ? "grid-cols-3 sm:grid-cols-5 md:grid-cols-3" : "grid-cols-3"}`}>
            {onCourt.map((p) => {
              const s = stats.players[p.id];
              const out = s && fouledOut(game, s);
              const isSel = selected === p.id;
              return (
                <button
                  key={p.id}
                  data-player={p.number}
                  onPointerDown={(e) => onPlayerPointerDown(e, p)}
                  onContextMenu={(e) => e.preventDefault()}
                  className={`relative rounded-2xl border-2 p-2 text-left touch-none min-h-[76px] ${isSel ? "border-brand bg-brand/15" : pending ? "border-brand/50 animate-pulse" : "border-line"} ${out ? "opacity-50" : ""}`}
                  style={{ background: isSel ? undefined : "var(--surface)" }}
                >
                  <div className="flex items-start justify-between">
                    <div className="text-3xl font-black leading-none" style={{ color: team?.color }}>
                      {p.number}
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-black tabular-nums leading-none">{s?.pts ?? 0}</div>
                      <div className="text-[9px] muted font-bold">PTS</div>
                    </div>
                  </div>
                  <div className="text-xs font-bold truncate mt-1">{p.lastName || p.firstName}</div>
                  <div className="flex gap-0.5 mt-1">
                    {Array.from({ length: is3 ? 0 : 5 }).map((_, i) => (
                      <span key={i} className={`h-1.5 flex-1 rounded-full ${i < (s?.pf ?? 0) ? (i >= 3 ? "bg-bad" : "bg-amber-400") : "surface-2"}`} />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
          {lineupTracked && bench.length > 0 && (
            <div className="mt-2 flex gap-1 overflow-x-auto no-scrollbar text-xs">
              <span className="muted font-bold py-1">{t("Banca")}:</span>
              {bench.map((p) => (
                <span key={p.id} className="chip shrink-0">
                  #{p.number} {stats.players[p.id]?.pts ? `· ${stats.players[p.id].pts}` : ""}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* ---------- acciones ---------- */}
        <section>
          <div className="grid grid-cols-4 gap-2">
            {actions
              .filter((a) => a.show)
              .map((a) => (
                <button
                  key={a.k}
                  data-action={a.k}
                  onClick={() => tapAction(a.k)}
                  disabled={!canScore}
                  className={`rounded-2xl min-h-[64px] font-black text-lg leading-tight border-2 ${a.tone} ${pending === a.k ? "border-white ring-4 ring-brand" : "border-transparent"} active:scale-95 transition`}
                >
                  {a.label}
                  <div className="text-[10px] font-bold opacity-80">{a.sub}</div>
                </button>
              ))}
          </div>

          {/* ---------- rival ---------- */}
          <div className="mt-3 rounded-2xl border-2 border-rival/40 p-2" style={{ background: "var(--surface)" }}>
            <div className="text-xs font-black text-rival mb-1.5 flex items-center justify-between">
              <span className="truncate">{game.opponentName}</span>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {(
                [
                  ["2m", `+${pv(2)}`, "bg-rival text-black"],
                  ["3m", `+${pv(3)}`, "bg-rival text-black"],
                  ["1m", "+1 TL", "bg-rival text-black"],
                  ["2x", `${pv(2)}✗`, "surface-2"],
                  ["3x", `${pv(3)}✗`, "surface-2"],
                  ["1x", "TL✗", "surface-2"],
                  ["oreb", "REB O", "surface-2"],
                  ["dreb", "REB D", "surface-2"],
                  ["tov", "PÉR", "surface-2"],
                  ["stl", "ROB", "surface-2"],
                  ["foul", "FALTA", "bg-amber-400 text-black"],
                  ["to", "TM", "surface-2"],
                ] as const
              ).map(([k, label, cls]) => (
                <button key={k} data-rival={k} disabled={!canScore} onClick={() => rivalAction(k)} className={`rounded-xl min-h-[46px] text-sm font-black ${cls} active:scale-95`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ---------- barra inferior ---------- */}
      <footer className="sticky bottom-0 z-20 border-t border-line safe-bottom" style={{ background: "var(--surface)" }}>
        {toast && (
          <div className="absolute -top-12 inset-x-3 flex justify-center pointer-events-none">
            <div className="px-4 py-2 rounded-full bg-black/85 text-white text-sm font-bold shadow-lg truncate max-w-full">{toast}</div>
          </div>
        )}
        <div className="grid grid-cols-5 gap-1 p-2 max-w-5xl mx-auto">
          <button className="btn !px-1 flex-col !gap-0 text-xs" onClick={undo} disabled={!canScore}>
            <Icon name="undo" /> {t("Deshacer")}
          </button>
          <button className="btn !px-1 flex-col !gap-0 text-xs" onClick={() => setSheet("log")}>
            <Icon name="list" /> {t("Jugadas")}
          </button>
          <button className="btn !px-1 flex-col !gap-0 text-xs" onClick={() => setSheet("box")}>
            <Icon name="chart" /> {t("Box")}
          </button>
          <button
            className="btn !px-1 flex-col !gap-0 text-xs"
            disabled={!canScore}
            onClick={async () => {
              await add({ team: "us", type: "timeout" }, { period: game.clock.period, clockMs });
              if (game.clock.running) await toggleClock();
              flash(t("Tiempo muerto propio"));
            }}
          >
            <Icon name="whistle" /> TM
          </button>
          <button className="btn !px-1 flex-col !gap-0 text-xs" onClick={() => setSheet("clock")}>
            <Icon name="clock" /> {t("Reloj")}
          </button>
        </div>
      </footer>

      {ghost && (
        <div className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-1/2 px-3 py-2 rounded-xl bg-brand text-black font-black shadow-xl" style={{ left: ghost.x, top: ghost.y }}>
          {ghost.label}
        </div>
      )}

      {/* ---------- preguntas ---------- */}
      <Sheet open={!!prompt} onClose={() => answer(null)} title={prompt?.title}>
        {prompt?.kind === "options" && (
          <div className={`grid gap-2 ${prompt.cols === 4 ? "grid-cols-4" : prompt.cols === 2 ? "grid-cols-2" : prompt.options.length <= 2 ? "grid-cols-2" : "grid-cols-4"}`}>
            {prompt.options.map((o, i) => (
              <button key={i} data-option={o.label} onClick={() => answer(o.value)} className={`btn !min-h-[64px] flex-col !gap-0 !px-1 border-2 ${o.tone ? toneCls[o.tone] : ""}`}>
                <span className="text-lg font-black leading-tight">{o.label}</span>
                {o.sub && <span className="text-[10px] font-semibold opacity-80 truncate max-w-full">{o.sub}</span>}
              </button>
            ))}
          </div>
        )}
        {prompt?.kind === "court" && (
          <div>
            <Court onTap={(x, y) => answer({ x, y })} color={prompt.color} />
            <button className="btn w-full mt-3" onClick={() => answer(null)}>
              {t("Omitir ubicación")}
            </button>
          </div>
        )}
      </Sheet>

      {/* ---------- titulares ---------- */}
      <StartersSheet open={sheet === "starters"} onClose={() => setSheet(null)} game={game} roster={roster} color={team?.color} />

      {/* ---------- cambios ---------- */}
      <SubsSheet
        open={sheet === "subs"}
        onClose={() => setSheet(null)}
        onCourt={onCourt}
        bench={bench}
        color={team?.color}
        stats={stats}
        onSub={async (outId, inId) => {
          await add({ team: "us", type: "sub", playerId: inId, outId }, { period: game.clock.period, clockMs });
          flash(`↑ ${pname(inId)} ↓ ${pname(outId)}`);
        }}
      />

      {/* ---------- jugadas ---------- */}
      <Sheet open={sheet === "log"} onClose={() => setSheet(null)} title={t("Jugadas")} wide>
        <button
          className="btn btn-primary w-full mb-3"
          onClick={() => {
            setEditEv({ team: "us", type: "shot2", made: true, period: game.clock.period, clockMs });
            setSheet("edit");
          }}
        >
          <Icon name="plus" /> {t("Agregar acción en cualquier minuto")}
        </button>
        <div className="divide-y divide-[var(--line)]">
          {[...events]
            .filter((e) => e.type !== "period_end")
            .sort((a, b) => b.period - a.period || a.clockMs - b.clockMs || b.createdAt - a.createdAt)
            .map((e) => (
              <button
                key={e.id}
                className="w-full flex items-center gap-2 py-2 text-left text-sm"
                onClick={() => {
                  setEditEv(e);
                  setSheet("edit");
                }}
              >
                <span className="w-16 shrink-0 muted tabular-nums text-xs">
                  {periodLabel(game, e.period, lang)} {fmtClock(e.clockMs)}
                </span>
                <span className={`w-1.5 h-6 rounded-full shrink-0 ${e.team === "us" ? "bg-brand" : "bg-rival"}`} />
                <span className="flex-1">{describeEvent(e, players, opponent, lang, is3)}</span>
                <Icon name="edit" className="w-4 h-4 muted" />
              </button>
            ))}
        </div>
      </Sheet>

      <EditEventSheet
        open={sheet === "edit"}
        ev={editEv}
        game={game}
        roster={roster}
        opponentPlayers={opponent?.players ?? []}
        onClose={() => {
          setSheet("log");
          setEditEv(null);
        }}
        pv={pv}
      />

      {/* ---------- box rápido ---------- */}
      <Sheet open={sheet === "box"} onClose={() => setSheet(null)} title={t("Box score")} wide>
        <QuickBox game={game} stats={stats} roster={roster} />
        <Link href={`/game/?id=${game.id}`} className="btn w-full mt-3">
          {t("Ver estadísticas completas")}
        </Link>
      </Sheet>

      {/* ---------- reloj ---------- */}
      <ClockSheet open={sheet === "clock"} onClose={() => setSheet(null)} game={game} clockMs={clockMs} onNext={nextPeriod} onToggle={toggleClock} />

      {/* ---------- menú ---------- */}
      <Sheet open={sheet === "menu"} onClose={() => setSheet(null)} title={t("Partido")}>
        <div className="space-y-2">
          <Link href={`/game/?id=${game.id}`} className="btn w-full">
            <Icon name="chart" /> {t("Estadísticas y exportar")}
          </Link>
          <button className="btn w-full" onClick={() => setSheet("starters")}>
            <Icon name="team" /> {t("Titulares / convocados")}
          </button>
          {cloudEnabled ? (
            <>
              <button
                className="btn w-full"
                onClick={async () => {
                  await patch<Game>("games", game.id, { publicLive: !game.publicLive });
                  if (!game.publicLive) {
                    const url = `${location.origin}/live/?g=${game.id}`;
                    try {
                      if (navigator.share) await navigator.share({ title: `${team?.name} vs ${game.opponentName}`, url });
                      else {
                        await navigator.clipboard.writeText(url);
                        alert(t("Enlace copiado"));
                      }
                    } catch {
                      /* cancelado */
                    }
                  }
                }}
              >
                <Icon name="link" /> {game.publicLive ? t("Desactivar marcador público") : t("Compartir marcador en vivo")}
              </button>
              <p className="muted text-xs">{t("Dos anotadores: otra persona del club con rol anotador abre este mismo partido en su celular; las acciones se combinan automáticamente.")}</p>
            </>
          ) : (
            <p className="muted text-xs">{t("El marcador público y los dos anotadores requieren configurar Supabase (ver README).")}</p>
          )}
          <div className="border-t border-line pt-2">
            <div className="label">{t("Nivel de detalle")}</div>
            <div className="grid grid-cols-3 gap-2">
              {(["basic", "advanced", "pro"] as const).map((d) => (
                <button key={d} className={`btn ${detail === d ? "btn-primary" : ""}`} onClick={() => patch<Game>("games", game.id, { detail: d })}>
                  {t(d === "basic" ? "Básico" : d === "advanced" ? "Avanzado" : "Pro")}
                </button>
              ))}
            </div>
          </div>
          {game.status !== "final" ? (
            <button className="btn btn-primary w-full" onClick={() => confirmAsk(t("¿Finalizar el partido?")) && finish()}>
              <Icon name="check" /> {t("Finalizar partido")}
            </button>
          ) : (
            <button className="btn w-full" onClick={() => patch<Game>("games", game.id, { status: "live" })}>
              {t("Reabrir partido")}
            </button>
          )}
          <button
            className="btn btn-danger w-full"
            onClick={async () => {
              if (confirmAsk(t("¿Eliminar el partido y todas sus jugadas?"))) {
                await remove("games", game.id);
                window.location.href = "/games/";
              }
            }}
          >
            <Icon name="trash" /> {t("Eliminar partido")}
          </button>
        </div>
      </Sheet>
    </div>
  );
}

function useClubRole(clubId: string) {
  const [role, setRole] = useState(roleOf(undefined));
  useEffect(() => {
    db.clubs.get(clubId).then((c) => setRole(roleOf(c)));
  }, [clubId]);
  return role;
}

// ---------- hojas auxiliares ----------
function StartersSheet({ open, onClose, game, roster, color }: { open: boolean; onClose: () => void; game: Game; roster: Player[]; color?: string }) {
  const { t } = usePrefs();
  const need = game.format === "3x3" ? 3 : 5;
  const [sel, setSel] = useState<string[]>(game.starterIds);
  useEffect(() => setSel(game.starterIds), [game.starterIds, open]);
  return (
    <Sheet open={open} onClose={onClose} title={t("Quinteto inicial")}>
      <p className="muted text-sm mb-3">{t("Elige {n} titulares para calcular minutos, +/- y quintetos. Puedes omitirlo para anotar más rápido.", { n: need })}</p>
      <div className="grid grid-cols-3 gap-2">
        {roster.map((p) => {
          const on = sel.includes(p.id);
          return (
            <button
              key={p.id}
              onClick={() => setSel(on ? sel.filter((x) => x !== p.id) : sel.length < need ? [...sel, p.id] : sel)}
              className={`rounded-2xl border-2 p-2 min-h-[64px] ${on ? "border-brand bg-brand/15" : "border-line"}`}
            >
              <div className="text-2xl font-black" style={{ color }}>
                {p.number}
              </div>
              <div className="text-xs font-bold truncate">{p.lastName || p.firstName}</div>
            </button>
          );
        })}
      </div>
      <div className="flex gap-2 mt-4">
        <button className="btn flex-1" onClick={onClose}>
          {t("Omitir")}
        </button>
        <button
          className="btn btn-primary flex-1"
          disabled={sel.length !== need}
          onClick={async () => {
            await patch<Game>("games", game.id, { starterIds: sel });
            onClose();
          }}
        >
          {t("Confirmar")} ({sel.length}/{need})
        </button>
      </div>
      {game.starterIds.length > 0 && (
        <p className="muted text-xs mt-2">{t("Cambiar los titulares recalcula minutos y +/- desde el inicio del partido.")}</p>
      )}
    </Sheet>
  );
}

function SubsSheet({
  open,
  onClose,
  onCourt,
  bench,
  color,
  stats,
  onSub,
}: {
  open: boolean;
  onClose: () => void;
  onCourt: Player[];
  bench: Player[];
  color?: string;
  stats: GameStats;
  onSub: (outId: string, inId: string) => Promise<void>;
}) {
  const { t } = usePrefs();
  const [out, setOut] = useState<string | null>(null);
  useEffect(() => setOut(null), [open]);
  const card = (p: Player, active: boolean, onClick: () => void) => (
    <button key={p.id} onClick={onClick} className={`rounded-2xl border-2 p-2 min-h-[64px] text-left ${active ? "border-brand bg-brand/15" : "border-line"}`}>
      <div className="flex justify-between">
        <span className="text-2xl font-black" style={{ color }}>
          {p.number}
        </span>
        <span className="text-[10px] muted text-right">
          {stats.players[p.id]?.pts ?? 0} pts
          <br />
          {fmtMin(stats.players[p.id]?.secs ?? 0)}
          <br />
          {stats.players[p.id]?.pf ?? 0} F
        </span>
      </div>
      <div className="text-xs font-bold truncate">{p.lastName || p.firstName}</div>
    </button>
  );
  return (
    <Sheet open={open} onClose={onClose} title={t("Cambios")}>
      <div className="label">{t("1. Sale (en cancha)")}</div>
      <div className="grid grid-cols-3 gap-2 mb-4">{onCourt.map((p) => card(p, out === p.id, () => setOut(p.id)))}</div>
      <div className="label">{t("2. Entra (banca)")}</div>
      <div className="grid grid-cols-3 gap-2">
        {bench.map((p) =>
          card(p, false, async () => {
            if (!out) return;
            await onSub(out, p.id);
            setOut(null);
          }),
        )}
      </div>
      {!out && <p className="muted text-xs mt-3">{t("Toca quien sale y luego quien entra. Puedes hacer varios cambios seguidos.")}</p>}
      <button className="btn btn-primary w-full mt-4" onClick={onClose}>
        {t("Listo")}
      </button>
    </Sheet>
  );
}

function ClockSheet({ open, onClose, game, clockMs, onNext, onToggle }: { open: boolean; onClose: () => void; game: Game; clockMs: number; onNext: () => void; onToggle: () => void }) {
  const { t, lang } = usePrefs();
  const [mm, setMm] = useState("");
  const [ss, setSs] = useState("");
  useEffect(() => {
    if (open) {
      setMm(String(Math.floor(clockMs / 60000)));
      setSs(String(Math.floor((clockMs % 60000) / 1000)).padStart(2, "0"));
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const adjust = (deltaMs: number) => {
    const max = periodLengthMs(game, game.clock.period);
    const remainingMs = Math.min(max, Math.max(0, currentClockMs(game.clock) + deltaMs));
    void patch<Game>("games", game.id, { clock: { ...game.clock, remainingMs, startedAt: game.clock.running ? Date.now() : undefined } });
  };
  return (
    <Sheet open={open} onClose={onClose} title={`${t("Reloj")} · ${periodLabel(game, game.clock.period, lang)}`}>
      <div className="text-center text-5xl font-black tabular-nums mb-3">{fmtClock(clockMs)}</div>
      <div className="grid grid-cols-4 gap-2 mb-3">
        {[-10000, -1000, 1000, 10000].map((d) => (
          <button key={d} className="btn" onClick={() => adjust(d)}>
            {d > 0 ? "+" : "−"}
            {Math.abs(d) / 1000}s
          </button>
        ))}
      </div>
      <div className="flex gap-2 items-end mb-3">
        <Field label={t("Min")}>
          <input className="input text-center" inputMode="numeric" value={mm} onChange={(e) => setMm(e.target.value)} />
        </Field>
        <Field label={t("Seg")}>
          <input className="input text-center" inputMode="numeric" value={ss} onChange={(e) => setSs(e.target.value)} />
        </Field>
        <button
          className="btn"
          onClick={() => {
            const ms = ((Number(mm) || 0) * 60 + (Number(ss) || 0)) * 1000;
            void patch<Game>("games", game.id, { clock: { ...game.clock, remainingMs: ms, running: false, startedAt: undefined } });
          }}
        >
          {t("Fijar")}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn btn-primary" onClick={onToggle}>
          <Icon name={game.clock.running ? "pause" : "play"} /> {game.clock.running ? t("Parar") : t("Iniciar")}
        </button>
        <button
          className="btn"
          onClick={() => {
            onClose();
            onNext();
          }}
        >
          {t("Siguiente periodo")}
        </button>
        <button
          className="btn col-span-2"
          disabled={game.clock.period <= 1}
          onClick={() => {
            const p = Math.max(1, game.clock.period - 1);
            void patch<Game>("games", game.id, { clock: { period: p, remainingMs: 0, running: false } });
          }}
        >
          {t("Volver al periodo anterior")}
        </button>
      </div>
    </Sheet>
  );
}

const EV_TYPES: { v: EventType; l: string }[] = [
  { v: "shot2", l: "Tiro de 2" },
  { v: "shot3", l: "Tiro de 3" },
  { v: "ft", l: "Tiro libre" },
  { v: "oreb", l: "Rebote ofensivo" },
  { v: "dreb", l: "Rebote defensivo" },
  { v: "ast", l: "Asistencia" },
  { v: "stl", l: "Robo" },
  { v: "blk", l: "Tapón" },
  { v: "tov", l: "Pérdida" },
  { v: "tov_forced", l: "Pérdida forzada" },
  { v: "foul", l: "Falta personal" },
  { v: "foul_tech", l: "Falta técnica" },
  { v: "foul_unsp", l: "Falta antideportiva" },
  { v: "foul_drawn", l: "Falta recibida" },
  { v: "timeout", l: "Tiempo muerto" },
  { v: "sub", l: "Cambio" },
];

function EditEventSheet({
  open,
  ev,
  game,
  roster,
  opponentPlayers,
  onClose,
  pv,
}: {
  open: boolean;
  ev: Partial<GameEvent> | null;
  game: Game;
  roster: Player[];
  opponentPlayers: { id: string; number: string; name?: string }[];
  onClose: () => void;
  pv: (n: number) => number;
}) {
  const { t, lang } = usePrefs();
  const [e, setE] = useState<Partial<GameEvent>>({});
  const [mm, setMm] = useState("0");
  const [ss, setSs] = useState("00");
  useEffect(() => {
    if (!ev) return;
    setE(ev);
    setMm(String(Math.floor((ev.clockMs ?? 0) / 60000)));
    setSs(String(Math.floor(((ev.clockMs ?? 0) % 60000) / 1000)).padStart(2, "0"));
  }, [ev]);
  if (!ev) return null;
  const isShot = e.type === "shot2" || e.type === "shot3" || e.type === "ft";
  const periodsAvail = Math.max(game.clock.period, game.periods);
  const savePlay = async () => {
    const clockMs = Math.min(periodLengthMs(game, e.period ?? 1), ((Number(mm) || 0) * 60 + (Number(ss) || 0)) * 1000);
    const points = e.type === "shot3" ? pv(3) : e.type === "shot2" ? pv(2) : e.type === "ft" ? 1 : undefined;
    const base = { ...e, clockMs, points, clubId: game.clubId, gameId: game.id } as GameEvent;
    if (!base.id) {
      base.id = uid();
      base.device = deviceId();
    }
    await save<GameEvent>("events", base);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={ev.id ? t("Editar acción") : t("Agregar acción")}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {(["us", "them"] as const).map((s) => (
            <button key={s} className={`btn ${e.team === s ? (s === "us" ? "btn-primary" : "!bg-rival !text-black") : ""}`} onClick={() => setE({ ...e, team: s, playerId: undefined })}>
              {s === "us" ? t("Nosotros") : game.opponentName}
            </button>
          ))}
        </div>
        <Field label={t("Acción")}>
          <select className="input" value={e.type} onChange={(x) => setE({ ...e, type: x.target.value as EventType })}>
            {EV_TYPES.map((o) => (
              <option key={o.v} value={o.v}>
                {t(o.l)}
              </option>
            ))}
          </select>
        </Field>
        {isShot && (
          <div className="grid grid-cols-2 gap-2">
            <button className={`btn ${e.made ? "!bg-ok !text-black" : ""}`} onClick={() => setE({ ...e, made: true })}>
              ✓ {t("Anotado")}
            </button>
            <button className={`btn ${e.made === false ? "!bg-bad !text-white" : ""}`} onClick={() => setE({ ...e, made: false })}>
              ✗ {t("Fallado")}
            </button>
          </div>
        )}
        <Field label={e.type === "sub" ? t("Entra") : t("Jugador")}>
          <select className="input" value={e.playerId ?? ""} onChange={(x) => setE({ ...e, playerId: x.target.value || undefined })}>
            <option value="">{t("Equipo / sin jugador")}</option>
            {(e.team === "us" ? roster.map((p) => ({ id: p.id, label: `#${p.number} ${p.firstName} ${p.lastName}` })) : opponentPlayers.map((p) => ({ id: p.id, label: `#${p.number} ${p.name ?? ""}` }))).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        {e.type === "sub" && (
          <Field label={t("Sale")}>
            <select className="input" value={e.outId ?? ""} onChange={(x) => setE({ ...e, outId: x.target.value || undefined })}>
              <option value="">—</option>
              {roster.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.number} {p.firstName} {p.lastName}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-3 gap-2">
          <Field label={t("Periodo")}>
            <select className="input" value={e.period} onChange={(x) => setE({ ...e, period: Number(x.target.value) })}>
              {Array.from({ length: periodsAvail }, (_, i) => i + 1).map((p) => (
                <option key={p} value={p}>
                  {periodLabel(game, p, lang)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("Min")}>
            <input className="input text-center" inputMode="numeric" value={mm} onChange={(x) => setMm(x.target.value)} />
          </Field>
          <Field label={t("Seg")}>
            <input className="input text-center" inputMode="numeric" value={ss} onChange={(x) => setSs(x.target.value)} />
          </Field>
        </div>
        {(e.type === "shot2" || e.type === "shot3") && (
          <div>
            <span className="label">{t("Ubicación (toca para cambiar)")}</span>
            <div className="max-w-xs">
              <Court onTap={(x, y) => setE({ ...e, x, y })} marker={e.x != null && e.y != null ? { x: e.x, y: e.y } : null} color={e.team === "us" ? "#ff6a13" : "#2bb3ff"} />
            </div>
          </div>
        )}
        <div className="flex gap-2 pt-2">
          {ev.id && (
            <button
              className="btn btn-danger"
              onClick={async () => {
                await remove("events", ev.id!);
                onClose();
              }}
            >
              <Icon name="trash" />
            </button>
          )}
          <button className="btn btn-primary flex-1" onClick={savePlay}>
            {t("Guardar")}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function QuickBox({ game, stats, roster }: { game: Game; stats: GameStats; roster: Player[] }) {
  const { t } = usePrefs();
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th>{t("Jugador")}</th>
            <th>MIN</th>
            <th>PTS</th>
            <th>REB</th>
            <th>AST</th>
            <th>ROB</th>
            <th>PÉR</th>
            <th>F</th>
            <th>+/-</th>
            <th>EFF</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((p) => {
            const s = stats.players[p.id];
            if (!s) return null;
            return (
              <tr key={p.id} className={stats.onCourt.includes(p.id) ? "font-bold" : ""}>
                <td>
                  #{p.number} {p.lastName || p.firstName}
                  {fouledOut(game, s) && " ⛔"}
                </td>
                <td>{fmtMin(s.secs)}</td>
                <td>{s.pts}</td>
                <td>{reb(s)}</td>
                <td>{s.ast}</td>
                <td>{s.stl}</td>
                <td>{s.tov}</td>
                <td>{s.pf}</td>
                <td>{s.pm > 0 ? `+${s.pm}` : s.pm}</td>
                <td>{eff(s)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function LivePage() {
  return (
    <Suspense>
      <LiveInner />
    </Suspense>
  );
}
