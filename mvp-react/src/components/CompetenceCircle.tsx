import { useMemo, useState } from "react";
import type { Dataset, Match, Occupation } from "../types";
import { outlook, shortLabel, trend } from "../lib/match";

interface Props {
  ds: Dataset;
  me: Occupation;
  mySkills: Set<string>;
  matches: Match[];
  selectedId: string | null;
  onSelect: (occupationId: string) => void;
  onToggleSkill: (skillId: string) => void;
}

const W = 900;
const H = 720;
const CX = W / 2;
const CY = H / 2;
const SKILL_RX = 200;
const SKILL_RY = 172;
const OCC_RX = 360;
const OCC_RY = 288;
const MAX_HAVE = 7;
const MAX_MISSING = 5;

const TAU = Math.PI * 2;
const angleAt = (i: number, n: number) => -Math.PI / 2 + (i * TAU) / n;
const pos = (a: number, rx: number, ry: number) => ({ x: CX + rx * Math.cos(a), y: CY + ry * Math.sin(a) });
const angDist = (a: number, b: number) => {
  const d = Math.abs(((a - b) % TAU) + TAU) % TAU;
  return Math.min(d, TAU - d);
};

export default function CompetenceCircle({ ds, me, mySkills, matches, selectedId, onSelect, onToggleSkill }: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const skillLabel = useMemo(() => new Map(ds.skills.map((s) => [s.id, shortLabel(s.label)])), [ds]);

  const layout = useMemo(() => {
    // 1. Yrken i yttre ringen – grupperade per yrkesgrupp så att liknande hamnar bredvid varandra
    const occs = [...matches].sort((a, b) => a.group.label.localeCompare(b.group.label) || b.score - a.score);
    const occNodes = occs.map((m, i) => ({ m, angle: angleAt(i, occs.length), ...pos(angleAt(i, occs.length), OCC_RX, OCC_RY) }));

    // 2. Välj kompetenser till inre ringen
    const relevance = new Map<string, number>();
    for (const m of matches) for (const s of [...m.have, ...m.missing]) relevance.set(s.skillId, (relevance.get(s.skillId) ?? 0) + s.share);
    const haveIds = [...mySkills]
      .filter((id) => skillLabel.has(id))
      .sort((a, b) => (relevance.get(b) ?? 0) - (relevance.get(a) ?? 0))
      .slice(0, MAX_HAVE);
    const bridgeCount = new Map<string, number>();
    for (const m of matches) for (const s of m.bridge) bridgeCount.set(s.skillId, (bridgeCount.get(s.skillId) ?? 0) + s.share);
    const missingIds = [...bridgeCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_MISSING)
      .map(([id]) => id);
    const skillIds = [...haveIds, ...missingIds];

    // 3. Placera varje kompetens nära de yrken den kopplar till (viktat cirkulärt medelvärde)
    const target = new Map<string, number>();
    skillIds.forEach((id, i) => {
      let sx = 0;
      let sy = 0;
      for (const n of occNodes) {
        const w = [...n.m.have, ...n.m.missing].find((s) => s.skillId === id)?.share ?? 0;
        sx += w * Math.cos(n.angle);
        sy += w * Math.sin(n.angle);
      }
      target.set(id, sx === 0 && sy === 0 ? angleAt(i, skillIds.length) : Math.atan2(sy, sx));
    });
    const ordered = [...skillIds].sort((a, b) => target.get(a)! - target.get(b)!);
    const n = ordered.length;
    let bestOffset = 0;
    let bestCost = Infinity;
    for (let k = 0; k < n; k++) {
      let cost = 0;
      ordered.forEach((id, i) => (cost += angDist(angleAt((i + k) % n, n), target.get(id)!)));
      if (cost < bestCost) {
        bestCost = cost;
        bestOffset = k;
      }
    }
    const skillNodes = ordered.map((id, i) => {
      const a = angleAt((i + bestOffset) % n, n);
      return { id, have: mySkills.has(id), label: truncate(skillLabel.get(id) ?? id, 15), ...pos(a, SKILL_RX, SKILL_RY) };
    });
    return { occNodes, skillNodes };
  }, [matches, mySkills, skillLabel]);

  const focusId = hoverId ?? selectedId;
  const skillPos = new Map(layout.skillNodes.map((s) => [s.id, s]));

  return (
    <svg className="circle" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="circle-title circle-desc">
      <title id="circle-title">Kompetenscirkel för {me.label}</title>
      <desc id="circle-desc">
        Ditt yrke i mitten, dina kompetenser och saknade kompetenser i inre ringen och närliggande yrken i yttre ringen, färgade efter jobbmöjligheter.
      </desc>
      <ellipse cx={CX} cy={CY} rx={SKILL_RX} ry={SKILL_RY} className="ring" />
      <ellipse cx={CX} cy={CY} rx={OCC_RX} ry={OCC_RY} className="ring ring--outer" />

      {/* Kanter: centrum → mina kompetenser */}
      {layout.skillNodes
        .filter((s) => s.have)
        .map((s) => (
          <line key={`c-${s.id}`} x1={CX} y1={CY} x2={s.x} y2={s.y} className="edge edge--center" />
        ))}

      {/* Kanter: kompetens → yrke */}
      {layout.occNodes.flatMap(({ m, x, y }) =>
        [...m.have, ...m.missing]
          .filter((s) => skillPos.has(s.skillId))
          .map((s) => {
            const sp = skillPos.get(s.skillId)!;
            const has = mySkills.has(s.skillId);
            const dim = focusId && focusId !== m.occupation.id;
            return (
              <line
                key={`${m.occupation.id}-${s.skillId}`}
                x1={sp.x}
                y1={sp.y}
                x2={x}
                y2={y}
                className={`edge ${has ? "edge--have" : "edge--missing"} ${dim ? "is-dim" : ""} ${focusId === m.occupation.id ? "is-focus" : ""}`}
                strokeWidth={0.6 + s.share * 3}
              />
            );
          }),
      )}

      {/* Centrum */}
      <g className="node-me">
        <circle cx={CX} cy={CY} r={74} />
        <text x={CX} y={CY - 4} textAnchor="middle" className="node-me__title">
          {wrap(me.label, 18)[0]}
        </text>
        {wrap(me.label, 18)[1] && (
          <text x={CX} y={CY + 14} textAnchor="middle" className="node-me__title">
            {wrap(me.label, 18)[1]}
          </text>
        )}
        <text x={CX} y={CY + 34} textAnchor="middle" className="node-me__sub">
          ditt yrke
        </text>
      </g>

      {/* Kompetenser */}
      {layout.skillNodes.map((s) => {
        const w = Math.min(140, 28 + s.label.length * 7.6);
        return (
          <g
            key={s.id}
            className={`node-skill ${s.have ? "node-skill--have" : "node-skill--missing"}`}
            transform={`translate(${s.x - w / 2}, ${s.y - 14})`}
            onClick={() => onToggleSkill(s.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onToggleSkill(s.id)}
            aria-label={`${s.label}: ${s.have ? "du har denna" : "saknas – klicka för att simulera att du lär dig den"}`}
          >
            <rect width={w} height={28} rx={14} />
            <text x={w / 2} y={18.5} textAnchor="middle">
              {s.have ? "" : "+ "}
              {s.label}
            </text>
          </g>
        );
      })}

      {/* Yrken */}
      {layout.occNodes.map(({ m, x, y }) => {
        const o = outlook(m.barometer);
        const t = trend(m.barometer);
        const selected = m.occupation.id === selectedId;
        const lines = wrap(m.occupation.label, 20);
        return (
          <g
            key={m.occupation.id}
            className={`node-occ node-occ--${o} ${selected ? "is-selected" : ""} ${hoverId && hoverId !== m.occupation.id ? "is-dim" : ""}`}
            transform={`translate(${x - 88}, ${y - 28})`}
            onClick={() => onSelect(m.occupation.id)}
            onMouseEnter={() => setHoverId(m.occupation.id)}
            onMouseLeave={() => setHoverId(null)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(m.occupation.id)}
            aria-label={`${m.occupation.label}, ${Math.round(m.score * 100)} procent match`}
          >
            <rect width={176} height={56} rx={8} />
            <text x={88} y={lines[1] ? 19 : 25} textAnchor="middle" className="node-occ__title">
              {lines[0]}
            </text>
            {lines[1] && (
              <text x={88} y={34} textAnchor="middle" className="node-occ__title">
                {lines[1]}
              </text>
            )}
            <text x={88} y={lines[1] ? 49 : 43} textAnchor="middle" className="node-occ__sub">
              {Math.round(m.score * 100)} % match
              {m.bridge.length > 0 ? ` · +${m.bridge.length}` : ""}
              {t === "up" ? " ↗" : t === "down" ? " ↘" : t === "flat" ? " →" : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function wrap(text: string, max: number): [string, string?] {
  if (text.length <= max) return [text];
  const words = text.split(/\s+/);
  let a = "";
  let i = 0;
  while (i < words.length && (a + " " + words[i]).trim().length <= max) a = (a + " " + words[i++]).trim();
  if (!a) return [text.slice(0, max - 1) + "…"];
  let b = words.slice(i).join(" ");
  if (b.length > max) b = b.slice(0, max - 1) + "…";
  return [a, b];
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
