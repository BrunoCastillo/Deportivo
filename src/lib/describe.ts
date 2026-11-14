import type { GameEvent, Opponent, Player, TovKind } from "./types";
import { translate, type Lang } from "./prefs";

export const TOV_LABEL: Record<TovKind, string> = {
  travel: "Pasos",
  double: "Dobles",
  bad_pass: "Mal pase",
  lost_ball: "Pérdida de balón",
  offensive_foul: "Falta en ataque",
  violation: "Violación (3s, 24s, campo atrás…)",
  other: "Otra",
};

export function playerName(p?: Player) {
  if (!p) return "";
  return `#${p.number} ${p.firstName} ${p.lastName}`.trim();
}

export function shortName(p?: Player) {
  if (!p) return "";
  return p.lastName || p.firstName;
}

export function describeEvent(e: GameEvent, players: Player[], opp: Opponent | undefined, lang: Lang, threeX3 = false) {
  const t = (s: string) => translate(lang, s);
  const who =
    e.team === "us"
      ? playerName(players.find((p) => p.id === e.playerId)) || t("Equipo")
      : (() => {
          const op = opp?.players.find((p) => p.id === e.playerId);
          return `${opp?.shortName ?? t("Rival")}${op ? ` #${op.number}` : ""}`;
        })();
  const pts = (n: number) => (threeX3 ? n - 1 : n);
  let what = "";
  switch (e.type) {
    case "shot2":
      what = `${t("Tiro de")} ${pts(2)} ${e.made ? t("anotado") : t("fallado")}${e.blockedBy ? ` (${t("taponado")})` : ""}`;
      break;
    case "shot3":
      what = `${t("Tiro de")} ${pts(3)} ${e.made ? t("anotado") : t("fallado")}`;
      break;
    case "ft":
      what = `${t("Tiro libre")} ${e.made ? t("anotado") : t("fallado")}`;
      break;
    case "oreb":
      what = t("Rebote ofensivo");
      break;
    case "dreb":
      what = t("Rebote defensivo");
      break;
    case "teamreb":
      what = t("Rebote de equipo");
      break;
    case "ast":
      what = t("Asistencia");
      break;
    case "stl":
      what = t("Robo");
      break;
    case "blk":
      what = t("Tapón");
      break;
    case "tov":
      what = `${t("Pérdida")}${e.tov ? ` · ${t(TOV_LABEL[e.tov])}` : ""}`;
      break;
    case "tov_forced":
      what = t("Pérdida forzada");
      break;
    case "foul":
      what = `${t("Falta personal")}${e.ftCount ? ` · ${e.ftCount} TL` : ""}`;
      break;
    case "foul_tech":
      what = t("Falta técnica");
      break;
    case "foul_unsp":
      what = t("Falta antideportiva");
      break;
    case "foul_drawn":
      what = t("Falta recibida");
      break;
    case "sub": {
      const inn = players.find((p) => p.id === e.playerId);
      const out = players.find((p) => p.id === e.outId);
      return `${t("Cambio")}: ↑ ${playerName(inn)} ↓ ${playerName(out)}`;
    }
    case "timeout":
      return `${t("Tiempo muerto")} · ${e.team === "us" ? t("Nosotros") : opp?.name ?? t("Rival")}`;
    case "period_end":
      return t("Fin del periodo");
  }
  return `${who} · ${what}`;
}
