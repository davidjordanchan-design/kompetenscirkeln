import { useMemo, useState } from "react";
import type { Dataset, SkillWeight } from "../types";
import { shortLabel } from "../lib/match";

interface Props {
  ds: Dataset;
  profile: SkillWeight[];
  mySkills: Set<string>;
  onToggle: (skillId: string) => void;
}

export default function SkillPanel({ ds, profile, mySkills, onToggle }: Props) {
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map(ds.skills.map((s) => [s.id, s])), [ds]);
  const profileIds = new Set(profile.map((p) => p.skillId));
  const extra = [...mySkills].filter((id) => !profileIds.has(id));

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return ds.skills.filter((s) => s.label.toLowerCase().includes(q) && !mySkills.has(s.id)).slice(0, 8);
  }, [ds, query, mySkills]);

  return (
    <div className="skills">
      <div className="label">Vilka kompetenser har du?</div>
      <p className="hint">De vanligaste i annonserna för ditt yrke. Stapeln visar hur stor andel av annonserna som nämner kompetensen.</p>
      <ul className="skills__list">
        {[...profile.map((p) => p.skillId), ...extra].map((id) => {
          const s = byId.get(id);
          if (!s) return null;
          const share = profile.find((p) => p.skillId === id)?.share;
          return (
            <li key={id}>
              <label className="skill-row">
                <input type="checkbox" checked={mySkills.has(id)} onChange={() => onToggle(id)} />
                <span className="skill-row__name" title={s.label}>
                  {shortLabel(s.label)}
                </span>
                {share !== undefined ? (
                  <span className="bar" aria-label={`${Math.round(share * 100)} procent av annonserna`}>
                    <span style={{ width: `${Math.min(100, share * 100)}%` }} />
                  </span>
                ) : (
                  <span className="tag">egen</span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
      <label htmlFor="skill-search" className="label label--small">
        Lägg till fler kompetenser
      </label>
      <input
        id="skill-search"
        type="search"
        placeholder="Kubernetes"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />
      {suggestions.length > 0 && (
        <ul className="suggest">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  onToggle(s.id);
                  setQuery("");
                }}
              >
                + {shortLabel(s.label)} <small>{s.headline}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim().length >= 2 && suggestions.length === 0 && <p className="hint">Hittade ingen kompetens med det namnet.</p>}
    </div>
  );
}
