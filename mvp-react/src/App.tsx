import { useEffect, useMemo, useState } from "react";
import type { Dataset } from "./types";
import { LAN, loadDataset } from "./lib/data";
import { outlook, profileFor, rankOccupations } from "./lib/match";
import OccupationPicker from "./components/OccupationPicker";
import SkillPanel from "./components/SkillPanel";
import CompetenceCircle from "./components/CompetenceCircle";
import MatchDetail from "./components/MatchDetail";

const CIRCLE_SIZE = 8;
const PRESELECT = 6;
/** Yrken under denna matchning visas inte */
const MIN_SCORE = 0.05;

export default function App() {
  const [ds, setDs] = useState<Dataset | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [mySkills, setMySkills] = useState<Set<string>>(new Set());
  const [lan, setLan] = useState("00");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    loadDataset().then((d) => {
      setDs(d);
      const start =
        d.occupations.find((o) => o.label === "Backend-utvecklare") ??
        [...d.occupations].filter((o) => !o.external).sort((a, b) => (b.adCount ?? 0) - (a.adCount ?? 0))[0];
      if (start) chooseOccupation(d, start.id);
    });
  }, []);

  function chooseOccupation(d: Dataset, id: string) {
    const occ = d.occupations.find((o) => o.id === id)!;
    setMeId(id);
    setMySkills(new Set(profileFor(d, occ).slice(0, PRESELECT).map((s) => s.skillId)));
    setSelectedId(null);
  }

  const me = ds?.occupations.find((o) => o.id === meId) ?? null;
  const myProfile = useMemo(() => (ds && me ? (ds.occSkills[me.id] ?? ds.groupSkills[me.groupId] ?? []).slice(0, 20) : []), [ds, me]);
  const ranked = useMemo(() => (ds && me ? rankOccupations(ds, me, mySkills, lan).filter((m) => m.score >= MIN_SCORE) : []), [ds, me, mySkills, lan]);
  const inCircle = ranked.slice(0, CIRCLE_SIZE);
  const selected = ranked.find((m) => m.occupation.id === selectedId) ?? inCircle[0] ?? null;
  const lanOptions = useMemo(() => {
    if (!ds) return ["00"];
    const codes = new Set<string>(["00"]);
    for (const byLan of Object.values(ds.barometer)) Object.keys(byLan).forEach((k) => codes.add(k));
    return [...codes].sort();
  }, [ds]);

  const toggle = (id: string) =>
    setMySkills((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const addSkills = (ids: string[]) => setMySkills((prev) => new Set([...prev, ...ids]));

  if (!ds) return <div className="loading">Laddar data …</div>;

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Kompetenscirkeln</h1>
          <p className="muted">Se vilka yrken dina kompetenser leder till – och vad som saknas för att ta steget.</p>
        </div>
        <div className="topbar__right">
          <label className="label label--small" htmlFor="lan">
            Prognos för
          </label>
          <select id="lan" value={lan} onChange={(e) => setLan(e.target.value)}>
            {lanOptions.map((c) => (
              <option key={c} value={c}>
                {LAN[c] ?? `Län ${c}`}
              </option>
            ))}
          </select>
        </div>
      </header>

      {ds.meta.demo && (
        <div className="notice" role="note">
          <strong>Demodata.</strong> Yrken och yrkesgrupper kommer från Arbetsförmedlingens taxonomi, men kompetensvikter och prognoser är
          illustrativa. Kör <code>npm run data</code> för att hämta riktiga data.
        </div>
      )}

      <main className="layout">
        <aside className="panel">
          <OccupationPicker ds={ds} value={meId} onChange={(id) => chooseOccupation(ds, id)} />
          {me && <SkillPanel ds={ds} profile={myProfile} mySkills={mySkills} onToggle={toggle} />}
          {me && (
            <button type="button" className="link-btn" onClick={() => chooseOccupation(ds, me.id)}>
              Återställ kompetenser
            </button>
          )}
        </aside>

        <section className="stage">
          {me && inCircle.length > 0 ? (
            <>
              <div className="circle-wrap">
              <CompetenceCircle
                ds={ds}
                me={me}
                mySkills={mySkills}
                matches={inCircle}
                selectedId={selected?.occupation.id ?? null}
                onSelect={setSelectedId}
                onToggleSkill={toggle}
              />
              </div>
              <Legend />
              <p className="hint center">Klicka på ett yrke för detaljer. Klicka på en kompetens för att simulera att du har den.</p>
            </>
          ) : (
            <p className="muted">{me ? "Bocka i några kompetenser till vänster så visas närliggande yrken." : "Välj ett yrke för att se cirkeln."}</p>
          )}

          <h2 className="list-title">Fler närliggande yrken</h2>
          <ol className="match-list">
            {ranked.slice(0, 15).map((m) => (
              <li key={m.occupation.id}>
                <button
                  type="button"
                  className={m.occupation.id === selected?.occupation.id ? "is-selected" : ""}
                  onClick={() => setSelectedId(m.occupation.id)}
                >
                  <span className={`dot dot--${outlook(m.barometer)}`} aria-hidden="true" />
                  <span className="match-list__name">{m.occupation.label}</span>
                  <span className="match-list__meta">
                    {Math.round(m.score * 100)} %{m.bridge.length ? ` · +${m.bridge.length} kompetens${m.bridge.length > 1 ? "er" : ""}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>

        <aside className="panel panel--detail">
          {selected ? <MatchDetail ds={ds} match={selected} mySkills={mySkills} onAddSkills={addSkills} /> : <p className="muted">Välj ett yrke i cirkeln.</p>}
        </aside>
      </main>

      <footer className="footer muted small">
        Källor: {ds.meta.sources.join(", ")}. {ds.meta.adsAnalyzed > 0 && `${ds.meta.adsAnalyzed.toLocaleString("sv-SE")} annonser analyserade. `}
        {ds.meta.barometerOmgang && `Yrkesbarometern ${ds.meta.barometerOmgang}. `}
        Data genererad {new Date(ds.meta.generated).toLocaleDateString("sv-SE")}. {ds.meta.method}
      </footer>
    </div>
  );
}

function Legend() {
  return (
    <ul className="legend" aria-label="Teckenförklaring">
      <li>
        <span className="sw sw--have" /> Kompetens du har
      </li>
      <li>
        <span className="sw sw--missing" /> Saknas (brygga)
      </li>
      <li>
        <span className="sw sw--high" /> Stora jobbmöjligheter
      </li>
      <li>
        <span className="sw sw--mid" /> Medelstora
      </li>
      <li>
        <span className="sw sw--low" /> Små
      </li>
      <li>↗ ↘ → prognos 5 år</li>
    </ul>
  );
}
