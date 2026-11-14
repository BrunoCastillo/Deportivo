"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { db } from "./db";
import { sb } from "./supabase";
import { usePrefs } from "./prefs";
import type { Club, Game, GameEvent, Role } from "./types";

const alive = <T extends { deleted?: boolean }>(rows: T[] | undefined) => (rows ?? []).filter((r) => !r.deleted);

export function useClubs() {
  return alive(useLiveQuery(() => db.clubs.toArray(), [], undefined));
}

/** Club activo: el elegido o el primero disponible. */
export function useActiveClub(): { club: Club | undefined; loading: boolean } {
  const { clubId, setClubId } = usePrefs();
  const raw = useLiveQuery(() => db.clubs.toArray(), [], undefined);
  const clubs = alive(raw);
  const club = clubs.find((c) => c.id === clubId) ?? clubs[0];
  useEffect(() => {
    if (club && club.id !== clubId) setClubId(club.id);
  }, [club, clubId, setClubId]);
  return { club, loading: raw === undefined };
}

export function useClubData(clubId?: string) {
  const data = useLiveQuery(async () => {
    if (!clubId) return null;
    const [teams, players, opponents, seasons, competitions, games] = await Promise.all([
      db.teams.where("clubId").equals(clubId).toArray(),
      db.players.where("clubId").equals(clubId).toArray(),
      db.opponents.where("clubId").equals(clubId).toArray(),
      db.seasons.where("clubId").equals(clubId).toArray(),
      db.competitions.where("clubId").equals(clubId).toArray(),
      db.games.where("clubId").equals(clubId).toArray(),
    ]);
    return {
      teams: alive(teams).sort((a, b) => a.name.localeCompare(b.name)),
      players: alive(players).sort((a, b) => (parseInt(a.number) || 0) - (parseInt(b.number) || 0)),
      opponents: alive(opponents).sort((a, b) => a.name.localeCompare(b.name)),
      seasons: alive(seasons).sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? "")),
      competitions: alive(competitions),
      games: alive(games).sort((a, b) => b.date.localeCompare(a.date)),
    };
  }, [clubId]);
  return data;
}

export function useGame(id?: string | null) {
  return useLiveQuery(async () => {
    if (!id) return null;
    const game = await db.games.get(id);
    if (!game || game.deleted) return null;
    const [events, players, opponent, team] = await Promise.all([
      db.events.where("gameId").equals(id).toArray(),
      db.players.where("teamId").equals(game.teamId).toArray(),
      game.opponentId ? db.opponents.get(game.opponentId) : Promise.resolve(undefined),
      db.teams.get(game.teamId),
    ]);
    return { game, events: events.filter((e) => !e.deleted), allEvents: events, players, opponent, team };
  }, [id]);
}

export function useAllEvents(clubId?: string) {
  return useLiveQuery(async () => {
    if (!clubId) return [] as GameEvent[];
    return alive(await db.events.where("clubId").equals(clubId).toArray());
  }, [clubId]);
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!sb());
  useEffect(() => {
    const c = sb();
    if (!c) return;
    c.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = c.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, ready };
}

/** Rol efectivo del usuario en el club. Sin nube o sin rol remoto => administrador local. */
export function roleOf(club?: Club): Role {
  return club?.myRole ?? "admin";
}

export const can = {
  manageClub: (r: Role) => r === "admin",
  manageTeams: (r: Role) => r === "admin" || r === "coach",
  score: (r: Role) => r === "admin" || r === "coach" || r === "scorer",
  view: (_r: Role) => true,
};

export function useNow(intervalMs = 250, active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, active]);
  return now;
}

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function useQueryParam(name: string) {
  return useSearchParams().get(name);
}

export type GameBundle = NonNullable<ReturnType<typeof useGame>>;
export type { Game };
