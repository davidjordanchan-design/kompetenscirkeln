"""Tester för pipelinen. Kör: python3 -m unittest discover -s pipeline/tests -v

Regressionstestet kräver data/raw/radata.json.gz (ögonblicksbilden 9 nov 2026), som inte ligger i repot
eftersom den innehåller annonstexter. Saknas filen hoppas testet över.
"""
import gzip, hashlib, json, os, sys, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
sys.path.insert(0, os.path.join(HERE, ".."))
import kompetens as k

RAW = os.path.join(ROOT, "data", "raw", "radata.json.gz")
REF = os.path.join(HERE, "referens.json")
NONE = {"tillagg": [], "synonymer": {}}


def digest(ds):
    body = {key: ds[key] for key in ("groupSkills", "occSkills")}  # vikterna; övriga fält är ren genomströmning
    return hashlib.sha256(json.dumps(body, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


def mini(texts, skills, **kw):
    ads = [{"id": i, "groupId": "g", "occupationId": "o", "text": t, "skillIds": []} for i, t in enumerate(texts)]
    raw = {"field": None, "fetched": "2026-01-01T00:00:00+00:00", "groups": [{"id": "g", "label": "G", "ssyk": "1"}],
           "occupations": [{"id": "o", "label": "O", "groupId": "g"}], "skillsByGroup": {"g": skills}, "ads": ads,
           "barometerRows": []}
    ds = k.build_dataset(raw, kw.get("extras", NONE))
    names = {s["id"]: s["label"] for s in ds["skills"]}
    return {names[x["skillId"]]: x["share"] for x in ds["groupSkills"]["g"]}


class Matchning(unittest.TestCase):
    def test_stoppord_och_skiftlage(self):
        got = mini(["Vi söker dig som kan Java och SQL.", "vi jobbar med sql"],
                   [{"id": "a", "label": "Vi, texteditor"}, {"id": "b", "label": "Java"}, {"id": "c", "label": "SQL"}])
        self.assertEqual(got, {"Java": 0.5, "SQL": 0.5})  # "Vi" stoppat, "sql" i gemener räknas inte som SQL

    def test_fras_och_sammanslagning(self):
        got = mini(["Erfarenhet av cybersäkerhet krävs", "Java är bra"],
                   [{"id": "a", "label": "Cybersäkerhet, moln"}, {"id": "b", "label": "Cybersäkerhet, nätverk"},
                    {"id": "c", "label": "Spring", "alt": ["Java, ramverk"]}, {"id": "d", "label": "Java"}])
        self.assertEqual(got, {"Cybersäkerhet": 0.5, "Java": 0.5})

    def test_tillagg_och_synonym(self):
        extras = {"tillagg": [{"label": "Kubernetes", "termer": ["K8s", "k8s"]}, {"label": "React", "cs": ["React"]}],
                  "synonymer": {"z": {"visa": "Azure", "termer": ["Azure"]}}}
        got = mini(["Vi kör k8s i Azure", "You must react quickly", "React och kubernetes"],
                   [{"id": "z", "label": "Windows Azure"}], extras=extras)
        self.assertEqual(got, {"Kubernetes": 0.6667, "Azure": 0.3333, "React": 0.3333})

    def test_reglerade_och_overgangar(self):
        raw = {"field": None, "fetched": "2026-01-01T00:00:00+00:00", "groups": [{"id": "g", "label": "G", "ssyk": "1"}],
               "occupations": [{"id": "o", "label": "O", "groupId": "g"}, {"id": "p", "label": "P", "groupId": "g"}],
               "skillsByGroup": {"g": [{"id": "a", "label": "Omvårdnad"}]}, "barometerRows": [],
               "ads": [{"id": 1, "groupId": "g", "occupationId": "o", "text": "Omvårdnad", "skillIds": []}],
               "regulated": {"o": [{"id": "leg", "label": "Legitimation som sjuksköterska"}], "finns-inte": [{"id": "x", "label": "X"}]},
               "transitions": {"o": ["p", "o", "finns-inte"], "finns-inte": ["o"]}}
        ds = k.build_dataset(raw, NONE)
        self.assertEqual(ds["regulated"], {"o": ["leg"]})          # okända yrken faller bort
        self.assertEqual(ds["transitions"], {"o": ["p"]})           # bara kända yrken, inte yrket självt
        self.assertIn("Legitimation som sjuksköterska", {s["label"] for s in ds["skills"]})  # finns med fast ingen annons nämner den

    def test_tillaggsfilen_ar_giltig(self):
        x = k.load_extras()
        self.assertTrue(x["tillagg"])
        for t in x["tillagg"]:
            self.assertTrue(t["label"] and set(t.get("cs", [])) <= {t["label"], *t.get("termer", [])}, t)


@unittest.skipUnless(os.path.exists(RAW), "data/raw/radata.json.gz saknas (ligger inte i repot)")
class Regression(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with gzip.open(RAW, "rt", encoding="utf-8") as f:
            cls.raw = json.load(f)
        with open(REF, encoding="utf-8") as f:
            cls.ref = json.load(f)

    def test_utan_tillagg_som_overlamningen(self):
        """Den sammanslagna pipelinen ger exakt samma resultat som recompute.py gav vid överlämningen."""
        self.assertEqual(digest(k.build_dataset(self.raw, NONE)), self.ref["utan_tillagg"])

    def test_med_tillagg(self):
        """Ändras matchningen eller tillagg.json med flit: python3 pipeline/tests/test_pipeline.py --uppdatera"""
        self.assertEqual(digest(k.build_dataset(self.raw)), self.ref["med_tillagg"])


if __name__ == "__main__":
    if "--uppdatera" in sys.argv:
        with gzip.open(RAW, "rt", encoding="utf-8") as f:
            raw = json.load(f)
        ref = json.load(open(REF, encoding="utf-8")) if os.path.exists(REF) else {}
        ref["med_tillagg"] = digest(k.build_dataset(raw))
        ref.setdefault("utan_tillagg", digest(k.build_dataset(raw, NONE)))
        json.dump(ref, open(REF, "w", encoding="utf-8"), indent=1)
        print("referens.json uppdaterad")
    else:
        unittest.main()
