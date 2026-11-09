#!/usr/bin/env node
/**
 * Bygger public/data/dataset.json från Arbetsförmedlingens/JobTechs öppna API:er.
 *
 *   npm run data                      # Data/IT (standard)
 *   FIELD_ID=NYW6_mP6_vwf npm run data  # annat yrkesområde (här Hälso- och sjukvård)
 *
 * Källor:
 *   - JobTech Taxonomy (GraphQL): yrkesgrupper (SSYK-4), yrkesbenämningar,
 *     kompetenser per yrkesgrupp, utbytbarhet (substitutability) mellan yrken
 *   - JobSearch: aktuella annonser i Platsbanken → hur ofta varje kompetens nämns
 *   - Yrkesbarometern (data.jobtechdev.se): jobbmöjligheter och 5-årsprognos per SSYK-4 och län
 *
 * Kräver Node 18+ (inbyggd fetch). Inga beroenden.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------- Konfiguration (kan överstyras med miljövariabler) ----------
const CFG = {
  FIELD_ID: process.env.FIELD_ID ?? "apaJ_2ja_LuF", // Data/IT
  TAXONOMY: process.env.TAXONOMY_BASE ?? "https://taxonomy.api.jobtechdev.se",
  JOBSEARCH: process.env.JOBSEARCH_BASE ?? "https://jobsearch.api.jobtechdev.se",
  BAROMETER_URL: process.env.BAROMETER_URL ?? "https://data.jobtechdev.se/prognoser/yrkesbarometer.json",
  MAX_ADS_PER_GROUP: Number(process.env.MAX_ADS_PER_GROUP ?? 2000), // JobSearch tillåter offset upp till 2000
  MAX_ADS_EXTERNAL_GROUP: Number(process.env.MAX_ADS_EXTERNAL_GROUP ?? 500),
  INCLUDE_EXTERNAL: (process.env.INCLUDE_EXTERNAL ?? "true") === "true", // ta med utbytbara yrken utanför området
  MAX_EXTERNAL_GROUPS: Number(process.env.MAX_EXTERNAL_GROUPS ?? 12),
  TOP_SKILLS: Number(process.env.TOP_SKILLS ?? 40), // antal kompetenser som sparas per yrke/yrkesgrupp
  MIN_SHARE: Number(process.env.MIN_SHARE ?? 0.02), // kompetens måste nämnas i minst 2 % av annonserna
  MIN_ADS_FOR_OCCUPATION: Number(process.env.MIN_ADS_FOR_OCCUPATION ?? 15), // annars ärvs yrkesgruppens profil
  DELAY_MS: Number(process.env.DELAY_MS ?? 150),
  OUT: resolve(__dirname, process.env.OUT ?? "../public/data/dataset.json"),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("•", ...a);

async function getJson(url, { retries = 3 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return await res.json();
    } catch (err) {
      if (attempt >= retries) throw new Error(`${url}\n  → ${err.message}`);
      await sleep(1000 * attempt);
    }
  }
}

async function gql(query) {
  const url = `${CFG.TAXONOMY}/v1/taxonomy/graphql?query=${encodeURIComponent(query)}`;
  const json = await getJson(url);
  if (json.errors?.length) throw new Error("GraphQL-fel: " + JSON.stringify(json.errors).slice(0, 500));
  await sleep(CFG.DELAY_MS);
  return json.data;
}

// ---------- 1. Taxonomi ----------
async function fetchField(fieldId) {
  const data = await gql(`{
    concepts(id: "${fieldId}") {
      id preferred_label
      narrower(type: "ssyk-level-4") {
        id preferred_label ssyk_code_2012
        narrower(type: "occupation-name") {
          id preferred_label
          substitutes { id preferred_label substitutability_percentage
            broader(type: "ssyk-level-4") { id preferred_label ssyk_code_2012 } }
        }
      }
    }
  }`);
  const field = data.concepts?.[0];
  if (!field) throw new Error(`Hittade inget yrkesområde med id ${fieldId}`);
  return field;
}

async function fetchGroupSkills(groupId) {
  const data = await gql(`{
    concepts(id: "${groupId}") {
      related(type: "skill") {
        id preferred_label alternative_labels hidden_labels
        broader(type: "skill-headline") { preferred_label }
      }
    }
  }`);
  return data.concepts?.[0]?.related ?? [];
}

// ---------- 2. Annonser ----------
async function fetchAds(groupId, maxAds) {
  const ads = [];
  let total = 0;
  for (let offset = 0; offset < maxAds; offset += 100) {
    const limit = Math.min(100, maxAds - offset);
    const url = `${CFG.JOBSEARCH}/search?occupation-group=${groupId}&limit=${limit}&offset=${offset}`;
    const json = await getJson(url);
    total = json.total?.value ?? 0;
    for (const h of json.hits ?? []) {
      ads.push({
        occupationId: h.occupation?.concept_id ?? null,
        text: `${h.headline ?? ""}\n${h.description?.text ?? ""}`,
        skillIds: [...(h.must_have?.skills ?? []), ...(h.nice_to_have?.skills ?? [])]
          .map((s) => s.concept_id)
          .filter(Boolean),
      });
    }
    await sleep(CFG.DELAY_MS);
    if (offset + 100 >= total || (json.hits ?? []).length === 0) break;
  }
  return { total, ads };
}

// ---------- 3. Matchning av kompetenser i annonstext ----------
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Etiketter ser ofta ut som "Python, programmeringsspråk" – första ledet är själva termen.
export function termsForSkill(skill) {
  const raw = [skill.preferred_label, ...(skill.alternative_labels ?? []), ...(skill.hidden_labels ?? [])];
  const terms = new Set();
  for (const label of raw) {
    if (!label) continue;
    const t = label.split(",")[0].replace(/\(.*?\)/g, "").trim();
    if (t.length >= 2) terms.add(t);
  }
  return [...terms];
}
export function buildMatcher(skill) {
  const res = termsForSkill(skill).map((t) => {
    // Korta termer (Go, R, C#) matchas skiftlägeskänsligt för att undvika brus
    const flags = t.replace(/[^\p{L}\p{N}]/gu, "").length <= 3 ? "u" : "iu";
    return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(t)}(?![\\p{L}\\p{N}])`, flags);
  });
  return (text) => res.some((re) => re.test(text));
}

export function skillShares(ads, skills, matchers) {
  const counts = new Map();
  for (const ad of ads) {
    const explicit = new Set(ad.skillIds);
    for (const s of skills) {
      if (explicit.has(s.id) || matchers.get(s.id)(ad.text)) counts.set(s.id, (counts.get(s.id) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([skillId, n]) => ({ skillId, share: +(n / Math.max(ads.length, 1)).toFixed(4) }))
    .filter((x) => x.share >= CFG.MIN_SHARE)
    .sort((a, b) => b.share - a.share)
    .slice(0, CFG.TOP_SKILLS);
}

// ---------- 4. Yrkesbarometern ----------
async function fetchBarometer(ssykCodes) {
  try {
    const rows = await getJson(CFG.BAROMETER_URL);
    const out = {};
    let omgang = null;
    for (const r of rows) {
      const ssyk = String(r.ssyk);
      if (!ssykCodes.has(ssyk)) continue;
      omgang ??= r.omgang;
      out[ssyk] ??= {};
      out[ssyk][r.lan] = {
        yrke: r.yb_yrke,
        jobbmojligheter: r.jobbmojligheter ?? null,
        rekrytering: r.rekryteringssituation ?? null,
        prognos: r.prognos ?? null,
        text: r.text_jobbmojligheter ?? null,
      };
    }
    return { barometer: out, omgang };
  } catch (err) {
    console.warn("⚠ Kunde inte hämta yrkesbarometern:", err.message);
    return { barometer: {}, omgang: null };
  }
}

// ---------- Huvudflöde ----------
async function main() {
  log(`Hämtar yrkesområde ${CFG.FIELD_ID} från taxonomin …`);
  const field = await fetchField(CFG.FIELD_ID);
  log(`${field.preferred_label}: ${field.narrower.length} yrkesgrupper`);

  const groups = [];
  const occupations = [];
  const internalOccIds = new Set();
  const externalGroups = new Map(); // groupId -> {group, occupations: Map}

  for (const g of field.narrower) {
    groups.push({ id: g.id, label: g.preferred_label, ssyk: g.ssyk_code_2012, external: false });
    for (const o of g.narrower ?? []) internalOccIds.add(o.id);
  }
  for (const g of field.narrower) {
    for (const o of g.narrower ?? []) {
      const subs = (o.substitutes ?? []).map((s) => ({ id: s.id, pct: s.substitutability_percentage ?? null }));
      occupations.push({ id: o.id, label: o.preferred_label, groupId: g.id, substitutes: subs });
      if (!CFG.INCLUDE_EXTERNAL) continue;
      for (const s of o.substitutes ?? []) {
        if (internalOccIds.has(s.id)) continue;
        const sg = s.broader?.[0];
        if (!sg) continue;
        if (!externalGroups.has(sg.id)) externalGroups.set(sg.id, { group: sg, occupations: new Map(), refs: 0 });
        const eg = externalGroups.get(sg.id);
        eg.refs++;
        eg.occupations.set(s.id, s.preferred_label);
      }
    }
  }

  // Välj de mest refererade externa yrkesgrupperna
  const chosenExternal = [...externalGroups.values()].sort((a, b) => b.refs - a.refs).slice(0, CFG.MAX_EXTERNAL_GROUPS);
  for (const eg of chosenExternal) {
    groups.push({ id: eg.group.id, label: eg.group.preferred_label, ssyk: eg.group.ssyk_code_2012, external: true });
    for (const [id, label] of eg.occupations) occupations.push({ id, label, groupId: eg.group.id, substitutes: [], external: true });
  }
  if (chosenExternal.length) log(`+ ${chosenExternal.length} närliggande yrkesgrupper utanför området (via utbytbarhet)`);

  const skillsById = new Map();
  const groupSkills = {};
  const occSkills = {};

  for (const g of groups) {
    log(`[${g.ssyk}] ${g.label}`);
    const skills = await fetchGroupSkills(g.id);
    const matchers = new Map();
    for (const s of skills) {
      matchers.set(s.id, buildMatcher(s));
      if (!skillsById.has(s.id))
        skillsById.set(s.id, { id: s.id, label: s.preferred_label, headline: s.broader?.[0]?.preferred_label ?? "Övrigt" });
    }
    const { total, ads } = await fetchAds(g.id, g.external ? CFG.MAX_ADS_EXTERNAL_GROUP : CFG.MAX_ADS_PER_GROUP);
    g.adCount = total;
    g.adsAnalyzed = ads.length;
    groupSkills[g.id] = skillShares(ads, skills, matchers);
    log(`    ${skills.length} kompetenser i taxonomin · ${ads.length}/${total} annonser analyserade · ${groupSkills[g.id].length} sparade`);

    // Profil per yrkesbenämning om det finns tillräckligt många annonser
    const byOcc = new Map();
    for (const ad of ads) {
      if (!ad.occupationId) continue;
      if (!byOcc.has(ad.occupationId)) byOcc.set(ad.occupationId, []);
      byOcc.get(ad.occupationId).push(ad);
    }
    for (const o of occupations.filter((o) => o.groupId === g.id)) {
      const oAds = byOcc.get(o.id) ?? [];
      o.adCount = oAds.length;
      if (oAds.length >= CFG.MIN_ADS_FOR_OCCUPATION) occSkills[o.id] = skillShares(oAds, skills, matchers);
    }
  }

  // Behåll bara kompetenser som faktiskt används
  const used = new Set();
  for (const list of [...Object.values(groupSkills), ...Object.values(occSkills)]) for (const x of list) used.add(x.skillId);
  const skills = [...skillsById.values()].filter((s) => used.has(s.id));

  log("Hämtar yrkesbarometern …");
  const { barometer, omgang } = await fetchBarometer(new Set(groups.map((g) => String(g.ssyk))));

  const dataset = {
    meta: {
      demo: false,
      generated: new Date().toISOString(),
      field: { id: field.id, label: field.preferred_label },
      barometerOmgang: omgang,
      adsAnalyzed: groups.reduce((n, g) => n + (g.adsAnalyzed ?? 0), 0),
      method:
        "Kompetensvikter = andel aktuella Platsbanken-annonser för yrket/yrkesgruppen som nämner kompetensen (textmatchning mot taxonomins kompetensetiketter + uttryckliga krav).",
      sources: ["JobTech Taxonomy", "JobSearch (Platsbanken)", "Yrkesbarometern"],
    },
    groups,
    occupations,
    skills,
    groupSkills,
    occSkills,
    barometer,
  };

  await mkdir(dirname(CFG.OUT), { recursive: true });
  await writeFile(CFG.OUT, JSON.stringify(dataset));
  log(`Klart! ${occupations.length} yrken, ${skills.length} kompetenser, ${dataset.meta.adsAnalyzed} annonser → ${CFG.OUT}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("\n✖ Misslyckades:", err.message);
    process.exit(1);
  });
}
