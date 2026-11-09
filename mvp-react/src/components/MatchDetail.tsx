import { useEffect, useMemo, useState } from "react";
import type { Dataset, Match } from "../types";
import { TARGET, outlook, scoreProfile, shortLabel, trend } from "../lib/match";
import { fetchLiveAdCount, platsbankenUrl } from "../lib/data";

interface Props {
  ds: Dataset;
  match: Match;
  mySkills: Set<string>;
  onAddSkills: (skillIds: string[]) => void;
}

const OUTLOOK_TEXT = { high: "Stora jobbmöjligheter", mid: "Medelstora jobbmöjligheter", low: "Små jobbmöjligheter", unknown: "Prognos saknas" };
const TREND_TEXT = { up: "väntas öka på 5 år", down: "väntas minska på 5 år", flat: "väntas vara oförändrade på 5 år" };

export default function MatchDetail({ ds, match, mySkills, onAddSkills }: Props) {
  const label = useMemo(() => new Map(ds.skills.map((s) => [s.id, shortLabel(s.label)])), [ds]);
  const [live, setLive] = useState<number | null>(null);
  const o = outlook(match.barometer);
  const t = trend(match.barometer);

  useEffect(() => {
    const ctrl = new AbortController();
    setLive(null);
    fetchLiveAdCount(match.occupation.id, ctrl.signal).then(setLive);
    return () => ctrl.abort();
  }, [match.occupation.id]);

  const after = match.bridge.length
    ? scoreProfile([...match.have, ...match.missing], new Set([...mySkills, ...match.bridge.map((b) => b.skillId)])).score
    : match.score;

  return (
    <section className="detail" aria-live="polite">
      <header className="detail__head">
        <div>
          <h2>{match.occupation.label}</h2>
          <p className="muted">
            {match.group.label} · SSYK {match.group.ssyk}
            {match.occupation.external ? " · utanför Data/IT" : ""}
          </p>
        </div>
        <div className="score">
          <strong>{Math.round(match.score * 100)} %</strong>
          <span>match</span>
        </div>
      </header>

      <div className="badges">
        <span className={`badge badge--${o}`}>
          {OUTLOOK_TEXT[o]}
          {t ? `, ${TREND_TEXT[t]}` : ""}
        </span>
        {match.substitutability !== null && (
          <span className="badge badge--info">
            Arbetsförmedlingen: {match.substitutability >= 75 ? "hög" : "viss"} utbytbarhet från ditt yrke
          </span>
        )}
        {live !== null && <span className="badge">{live} annonser i Platsbanken nu</span>}
      </div>
      {match.barometer?.text && <p className="muted small">{match.barometer.text}</p>}

      {match.bridge.length > 0 ? (
        <div className="bridge">
          <p>
            <strong>Din brygga:</strong> lär dig{" "}
            {match.bridge.map((b, i) => (
              <span key={b.skillId}>
                {i > 0 ? (i === match.bridge.length - 1 ? " och " : ", ") : ""}
                <em>{label.get(b.skillId)}</em>
              </span>
            ))}{" "}
            så går du från {Math.round(match.score * 100)} % till {Math.round(after * 100)} % match.
          </p>
          <button type="button" onClick={() => onAddSkills(match.bridge.map((b) => b.skillId))}>
            Simulera att jag lär mig dem
          </button>
        </div>
      ) : (
        <p className="bridge bridge--ok">Du täcker redan minst {Math.round(TARGET * 100)} % av yrkets kärnkompetenser.</p>
      )}

      <div className="cols">
        <div>
          <h3>Du har</h3>
          <SkillBars items={match.have} label={label} kind="have" />
        </div>
        <div>
          <h3>Saknas</h3>
          <SkillBars items={match.missing} label={label} kind="missing" onAdd={(id) => onAddSkills([id])} />
        </div>
      </div>

      <p className="muted small">
        Procenten visar hur stor andel av annonserna för yrket som nämner kompetensen.{" "}
        <a href={platsbankenUrl(match.occupation.label)} target="_blank" rel="noreferrer">
          Se annonser i Platsbanken
        </a>
      </p>
    </section>
  );
}

function SkillBars({
  items,
  label,
  kind,
  onAdd,
}: {
  items: { skillId: string; share: number }[];
  label: Map<string, string>;
  kind: "have" | "missing";
  onAdd?: (id: string) => void;
}) {
  if (items.length === 0) return <p className="muted small">{kind === "have" ? "Inga av yrkets kärnkompetenser än." : "Inget saknas."}</p>;
  return (
    <ul className={`sbars sbars--${kind}`}>
      {items.map((s) => (
        <li key={s.skillId}>
          <span className="sbars__name">{label.get(s.skillId)}</span>
          <span className="bar">
            <span style={{ width: `${Math.min(100, s.share * 100)}%` }} />
          </span>
          <span className="sbars__pct">{Math.round(s.share * 100)} %</span>
          {onAdd && (
            <button type="button" className="icon-btn" onClick={() => onAdd(s.skillId)} aria-label={`Simulera att du lär dig ${label.get(s.skillId)}`}>
              +
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
