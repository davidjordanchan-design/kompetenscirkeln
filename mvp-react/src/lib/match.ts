import type { BarometerEntry, Dataset, Group, Match, Occupation, SkillWeight } from "../types";

/** Antal kärnkompetenser per yrke som används i matchningen */
export const CORE_SKILLS = 15;
/** Målnivå för "bryggan": hur stor del av yrkets kärnkompetenser du vill täcka */
export const TARGET = 0.7;

export function profileFor(ds: Dataset, occ: Occupation): SkillWeight[] {
  return (ds.occSkills[occ.id] ?? ds.groupSkills[occ.groupId] ?? []).slice(0, CORE_SKILLS);
}

export function hasOwnProfile(ds: Dataset, occ: Occupation): boolean {
  return Boolean(ds.occSkills[occ.id]?.length);
}

export function barometerFor(ds: Dataset, group: Group, lan: string): BarometerEntry | null {
  const bySsyk = ds.barometer[String(group.ssyk)];
  if (!bySsyk) return null;
  return bySsyk[lan] ?? bySsyk["00"] ?? null;
}

export function scoreProfile(profile: SkillWeight[], mySkills: Set<string>) {
  const total = profile.reduce((s, x) => s + x.share, 0);
  const have = profile.filter((x) => mySkills.has(x.skillId));
  const missing = profile.filter((x) => !mySkills.has(x.skillId));
  const covered = have.reduce((s, x) => s + x.share, 0);
  const score = total > 0 ? covered / total : 0;

  // Bryggan: lägg till saknade kompetenser i viktordning tills målnivån nås
  const bridge: SkillWeight[] = [];
  let acc = covered;
  for (const m of missing) {
    if (total === 0 || acc / total >= TARGET) break;
    bridge.push(m);
    acc += m.share;
  }
  return { score, have, missing, bridge };
}

export function rankOccupations(
  ds: Dataset,
  me: Occupation,
  mySkills: Set<string>,
  lan: string,
): Match[] {
  const groupsById = new Map(ds.groups.map((g) => [g.id, g]));
  const subs = new Map(me.substitutes.map((s) => [s.id, s.pct]));
  const out: Match[] = [];

  for (const occ of ds.occupations) {
    if (occ.id === me.id) continue;
    // Yrken utan egen annonsprofil i samma grupp blir kopior av ditt eget yrke – hoppa över
    if (occ.groupId === me.groupId && !hasOwnProfile(ds, occ)) continue;
    const profile = profileFor(ds, occ);
    if (profile.length === 0) continue;
    const group = groupsById.get(occ.groupId)!;
    const { score, have, missing, bridge } = scoreProfile(profile, mySkills);
    out.push({
      occupation: occ,
      group,
      score,
      have,
      missing,
      bridge,
      substitutability: subs.get(occ.id) ?? null,
      barometer: barometerFor(ds, group, lan),
    });
  }

  return out.sort(
    (a, b) => b.score - a.score || (b.substitutability ?? 0) - (a.substitutability ?? 0) || (b.occupation.adCount ?? 0) - (a.occupation.adCount ?? 0),
  );
}

export type Outlook = "high" | "mid" | "low" | "unknown";

export function outlook(b: BarometerEntry | null): Outlook {
  const v = b?.jobbmojligheter?.toLowerCase() ?? "";
  if (v.startsWith("stor") || v.includes("mycket stora")) return "high";
  if (v.startsWith("medel")) return "mid";
  if (v.startsWith("små") || v.includes("mycket små")) return "low";
  return "unknown";
}

export function trend(b: BarometerEntry | null): "up" | "down" | "flat" | null {
  const v = b?.prognos?.toLowerCase() ?? "";
  if (!v) return null;
  if (v.includes("öka")) return "up";
  if (v.includes("minska")) return "down";
  return "flat";
}

/** "Python, programmeringsspråk" -> "Python" */
export function shortLabel(label: string): string {
  return label.split(",")[0].trim();
}
