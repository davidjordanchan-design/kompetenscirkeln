import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scoreProfile, rankOccupations, outlook, trend } from "../src/lib/match.ts";
import { buildMatcher } from "./build-dataset.mjs";

test("scoreProfile viktar efter andel annonser och bygger brygga", () => {
  const p = [{ skillId: "a", share: 0.6 }, { skillId: "b", share: 0.3 }, { skillId: "c", share: 0.1 }];
  const r = scoreProfile(p, new Set(["c"]));
  assert.equal(Math.round(r.score * 100), 10);
  assert.deepEqual(r.bridge.map((x) => x.skillId), ["a"]); // 0.1 + 0.6 = 70 %
  assert.equal(scoreProfile(p, new Set(["a", "b"])).bridge.length, 0);
});

test("rankOccupations på demodatan", () => {
  const ds = JSON.parse(readFileSync(new URL("../src/data/demo-dataset.json", import.meta.url)));
  const me = ds.occupations.find((o) => o.label === "Backend-utvecklare");
  const mine = new Set(ds.occSkills[me.id].slice(0, 6).map((s) => s.skillId));
  const ranked = rankOccupations(ds, me, mine, "00");
  assert.ok(ranked.length > 10);
  assert.ok(!ranked.some((m) => m.occupation.id === me.id));
  for (let i = 1; i < ranked.length; i++) assert.ok(ranked[i - 1].score >= ranked[i].score);
  assert.ok(ranked.slice(0, 3).some((m) => m.occupation.label === "Fullstack-utvecklare"));
  console.log(ranked.slice(0, 8).map((m) => `${m.occupation.label} ${Math.round(m.score * 100)}% +${m.bridge.length}`).join("\n"));
});

test("prognosmappning", () => {
  assert.equal(outlook({ jobbmojligheter: "stora" }), "high");
  assert.equal(outlook({ jobbmojligheter: "medelstora" }), "mid");
  assert.equal(outlook({ jobbmojligheter: "små" }), "low");
  assert.equal(outlook(null), "unknown");
  assert.equal(trend({ prognos: "öka" }), "up");
  assert.equal(trend({ prognos: "vara oförändrad" }), "flat");
});

test("textmatchning av kompetenser", () => {
  const go = buildMatcher({ preferred_label: "Go, programmeringsspråk" });
  assert.ok(go("Erfarenhet av Go och Rust"));
  assert.ok(!go("we go live"));
  const react = buildMatcher({ preferred_label: "React, ramverk", alternative_labels: ["ReactJS"] });
  assert.ok(react("Vi jobbar i react"));
  assert.ok(react("ReactJS"));
  assert.ok(!react("reaktiv / reactive"));
  const cs = buildMatcher({ preferred_label: "C#, programmeringsspråk" });
  assert.ok(cs("Kunskaper i C# och .NET"));
});
