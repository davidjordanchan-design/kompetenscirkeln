"""Kompetenscirkeln: hämtar Arbetsförmedlingens öppna data och skriver en färdig datafil. En körning, inga beroenden.

    python3 pipeline/hamta.py                         # alla yrkesområden -> data/dataset.json + data/raw/radata.json.gz
    python3 pipeline/hamta.py --utan-radata           # bara datafilen (så körs veckojobbet på GitHub)
    FIELD_ID=<id> python3 pipeline/hamta.py           # ett enda yrkesområde, t.ex. apaJ_2ja_LuF (Data/IT)

Kräver nät mot jobtechdev.se (vanlig dator, Colab eller GitHub Actions) och Python 3.9+.
Skriptet avbryter utan att skriva något om hämtningen ser trasig ut, så att en dålig körning inte publiceras.
"""
import argparse, gzip, json, os, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kompetens

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
CFG = {
    "FIELD_ID": os.environ.get("FIELD_ID", "alla"),  # "alla" eller ett yrkesområdes id, t.ex. apaJ_2ja_LuF (Data/IT)
    "TAXONOMY": os.environ.get("TAXONOMY_BASE", "https://taxonomy.api.jobtechdev.se"),
    "JOBSEARCH": os.environ.get("JOBSEARCH_BASE", "https://jobsearch.api.jobtechdev.se"),
    "BAROMETER_URL": os.environ.get("BAROMETER_URL", "https://data.jobtechdev.se/prognoser/yrkesbarometer.json"),
    # Arbetsförmedlingens härledda datamängder (CC0): Kompetensväljaren och Närliggande yrken
    "AF_REPOS": os.environ.get("AF_REPOS", "https://gitlab.com/arbetsformedlingen/taxonomy-dev/backend"),
    "AF_API": os.environ.get("AF_API", "https://gitlab.com/api/v4/projects/arbetsformedlingen%2Ftaxonomy-dev%2Fbackend%2F"),
    "MAX_ADS_PER_GROUP": 2000, "MAX_ADS_EXTERNAL_GROUP": 500, "INCLUDE_EXTERNAL": True, "MAX_EXTERNAL_GROUPS": 12,
    "DELAY": float(os.environ.get("DELAY", "0.15")), "RAW_TEXT_MAX": 6000,
    # rimlighetsgränser: under dessa skrivs ingen fil
    "MIN_GROUPS": 3, "MIN_ADS": int(os.environ.get("MIN_ADS", "500")),
}


def get_json(url, retries=4):
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"accept": "application/json", "user-agent": "kompetenscirkeln"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code < 500 and e.code != 429 or attempt >= retries:
                raise RuntimeError(f"{url}\n  -> HTTP {e.code}")
        except Exception as e:
            if attempt >= retries:
                raise RuntimeError(f"{url}\n  -> {e}")
        time.sleep(2 * attempt)


def gql(query):
    data = get_json(f"{CFG['TAXONOMY']}/v1/taxonomy/graphql?query={urllib.parse.quote(query)}")
    if data.get("errors"):
        raise RuntimeError("GraphQL-fel: " + json.dumps(data["errors"])[:500])
    time.sleep(CFG["DELAY"])
    return data["data"]


def fetch_field(fid):
    d = gql('{ concepts(id: "%s") { id preferred_label narrower(type: "ssyk-level-4") { id preferred_label ssyk_code_2012 '
            'narrower(type: "occupation-name") { id preferred_label substitutes { id preferred_label substitutability_percentage '
            'broader(type: "ssyk-level-4") { id preferred_label ssyk_code_2012 } } } } } }' % fid)
    if not d.get("concepts"):
        raise RuntimeError(f"Hittade inget yrkesområde med id {fid}")
    return d["concepts"][0]


def fetch_fields():
    d = gql('{ concepts(type: "occupation-field") { id preferred_label } }')
    return sorted(d["concepts"], key=lambda f: f["preferred_label"])


def fetch_skills():
    """Hela kompetenslistan (cirka 6 800) med alternativa och dolda etiketter."""
    d = gql('{ concepts(type: "skill") { id preferred_label alternative_labels hidden_labels '
            'broader(type: "skill-headline") { preferred_label } } }')
    return [{"id": s["id"], "label": s["preferred_label"], "alt": s.get("alternative_labels") or [],
             "hidden": s.get("hidden_labels") or [],
             "headline": ((s.get("broader") or [{}])[0] or {}).get("preferred_label")} for s in d["concepts"]]


def fetch_ads(gid, max_ads):
    ads, seen, total, offset = [], set(), 0, 0
    while offset < max_ads:
        limit = min(100, max_ads - offset)
        j = get_json(f"{CFG['JOBSEARCH']}/search?occupation-group={gid}&limit={limit}&offset={offset}")
        total = (j.get("total") or {}).get("value", 0)
        hits = j.get("hits") or []
        for h in hits:
            if h.get("id") in seen:  # sidindelningen kan ge samma annons två gånger när nya publiceras under hämtningen
                continue
            seen.add(h.get("id"))
            sk = ((h.get("must_have") or {}).get("skills") or []) + ((h.get("nice_to_have") or {}).get("skills") or [])
            text = f"{h.get('headline') or ''}\n{(h.get('description') or {}).get('text') or ''}"
            ads.append({
                "id": h.get("id"), "published": h.get("publication_date"),
                "region": (h.get("workplace_address") or {}).get("region"),
                "occupationId": (h.get("occupation") or {}).get("concept_id"),
                "text": text[: CFG["RAW_TEXT_MAX"]],
                "skillIds": [s.get("concept_id") for s in sk if s.get("concept_id")],
                "groupId": gid,
            })
        time.sleep(CFG["DELAY"])
        if offset + 100 >= total or not hits:
            break
        offset += 100
    return total, ads


def latest_version(repo, path, pattern):
    """Datamängderna ges ut per taxonomiversion (t27, t28 ...). Ger namnet med högst nummer."""
    import re
    names = [t["name"] for t in get_json(f"{CFG['AF_API']}{repo}/repository/tree?path={path}&per_page=100")]
    hits = [(int(m.group(1)), n) for n in names for m in [re.fullmatch(pattern, n)] if m]
    if not hits:
        raise RuntimeError(f"hittade ingen version i {repo}/{path}")
    return max(hits)[1]


def fetch_af_extras():
    """Reglerade behörigheter per yrke (Kompetensväljaren) och närliggande yrken som också är statistiska
    yrkesövergångar (Närliggande yrken). Returnerar None om hämtningen misslyckas, så att resten ändå går igenom."""
    try:
        f = latest_version("kompetensvaljaren", "output/v1", r"kompetensvaljaren-t(\d+)\.json")
        kv = get_json(f"{CFG['AF_REPOS']}/kompetensvaljaren/-/raw/main/output/v1/{f}")
        regulated = {oid: [{"id": sid, "label": " ".join(label.split())} for label, sid in v["regulated_skills"].items()]
                     for oid, v in kv["data"].items() if v.get("type") == "occupation-name" and v.get("regulated_skills")}
        t = latest_version("narliggande-yrken", "output/v1", r"t(\d+)")
        transitions = {}
        for name in ("narliggande-yrken.json", "narliggande-yrken-gyr.json"):  # med och utan yrken i samma yrkesgrupp
            for oid, v in get_json(f"{CFG['AF_REPOS']}/narliggande-yrken/-/raw/main/output/v1/{t}/{name}")["data"].items():
                lst = transitions.setdefault(oid, [])
                lst.extend(x["id"] for x in v.get("similar", []) if x["id"] not in lst)
        if not regulated or not transitions:
            raise RuntimeError("tomma datamängder")
        print(f"• Arbetsförmedlingens datamängder: {len(regulated)} yrken med reglerad behörighet ({f}), {len(transitions)} yrken med övergångar ({t})")
        return {"regulated": regulated, "transitions": transitions, "versions": {"kompetensvaljaren": f, "narliggandeYrken": t}}
    except Exception as e:
        print("⚠ Kunde inte hämta Kompetensväljaren/Närliggande yrken:", str(e)[:200])
        return None


def fetch_raw():
    alla = CFG["FIELD_ID"].lower() == "alla"
    ids = [f["id"] for f in fetch_fields()] if alla else [CFG["FIELD_ID"]]
    print(f"• Hämtar {len(ids)} yrkesområde(n) från taxonomin …")
    fields, groups, occupations, internal, external, seen_groups = [], [], [], set(), {}, set()
    tree = [fetch_field(fid) for fid in ids]
    for field in tree:
        fields.append({"id": field["id"], "label": field["preferred_label"]})
        for g in field["narrower"]:
            if g["id"] in seen_groups:
                continue
            seen_groups.add(g["id"])
            groups.append({"id": g["id"], "label": g["preferred_label"], "ssyk": g["ssyk_code_2012"],
                           "fieldId": field["id"], "external": False})
            for o in g.get("narrower") or []:
                internal.add(o["id"])
    seen_occ = set()
    for field in tree:
        for g in field["narrower"]:
            for o in g.get("narrower") or []:
                if o["id"] in seen_occ:
                    continue
                seen_occ.add(o["id"])
                subs = o.get("substitutes") or []
                occupations.append({"id": o["id"], "label": o["preferred_label"], "groupId": g["id"],
                                    "substitutes": [{"id": s["id"], "pct": s.get("substitutability_percentage")} for s in subs]})
                if alla or not CFG["INCLUDE_EXTERNAL"]:
                    continue
                for s in subs:
                    sg = (s.get("broader") or [None])[0]
                    if s["id"] in internal or not sg:
                        continue
                    e = external.setdefault(sg["id"], {"group": sg, "occupations": {}, "refs": 0})
                    e["refs"] += 1
                    e["occupations"][s["id"]] = s["preferred_label"]
    # bara när ett enda yrkesområde hämtas: ta med närliggande yrkesgrupper utanför området
    for e in sorted(external.values(), key=lambda e: -e["refs"])[: CFG["MAX_EXTERNAL_GROUPS"]]:
        g = e["group"]
        groups.append({"id": g["id"], "label": g["preferred_label"], "ssyk": g["ssyk_code_2012"], "fieldId": None, "external": True})
        for oid, label in e["occupations"].items():
            occupations.append({"id": oid, "label": label, "groupId": g["id"], "substitutes": [], "external": True})
    print(f"• {len(groups)} yrkesgrupper, {len(occupations)} yrken")

    skills = fetch_skills()
    print(f"• {len(skills)} kompetenser i taxonomin")
    raw = {"field": {"id": "alla", "label": "Alla yrkesområden"} if alla else fields[0], "fields": fields,
           "fetched": datetime.now(timezone.utc).isoformat(), "groups": groups, "skills": skills, "ads": [],
           "barometerRows": [], "occupations": occupations}
    for i, g in enumerate(groups, 1):
        total, ads = fetch_ads(g["id"], CFG["MAX_ADS_EXTERNAL_GROUP"] if g["external"] else CFG["MAX_ADS_PER_GROUP"])
        raw["ads"].extend(ads)
        g["adCount"], g["adsAnalyzed"] = total, len(ads)
        per_occ = {}
        for ad in ads:
            if ad["occupationId"]:
                per_occ[ad["occupationId"]] = per_occ.get(ad["occupationId"], 0) + 1
        for o in occupations:
            if o["groupId"] == g["id"]:
                o["adCount"] = per_occ.get(o["id"], 0)
        if i % 25 == 0 or i == len(groups):
            print(f"• {i}/{len(groups)} yrkesgrupper, {len(raw['ads'])} annonser", flush=True)

    print("• Hämtar Yrkesbarometern …")
    ssyks = {str(g["ssyk"]) for g in groups}
    raw["barometerRows"] = [r for r in get_json(CFG["BAROMETER_URL"]) if str(r.get("ssyk")) in ssyks]
    return raw


def check(raw, ds):
    """Rimlighetskontroll. Returnerar en lista med fel; tom lista = godkänt."""
    fel = []
    if len(raw["groups"]) < CFG["MIN_GROUPS"]:
        fel.append(f"bara {len(raw['groups'])} yrkesgrupper")
    if len(raw["ads"]) < CFG["MIN_ADS"]:
        fel.append(f"bara {len(raw['ads'])} annonser (gräns {CFG['MIN_ADS']})")
    if not any(ds["groupSkills"].values()):
        fel.append("inga kompetenser matchade")
    if not ds["barometer"] or not ds["meta"]["barometerOmgang"]:
        fel.append("Yrkesbarometern är tom eller har bytt fältnamn")
    elif not any(v.get("jobbmojligheter") for lan in ds["barometer"].values() for v in lan.values()):
        fel.append("Yrkesbarometern saknar fältet jobbmojligheter")
    return fel


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--ut", default=os.path.join(ROOT, "data", "dataset.json"))
    ap.add_argument("--radata", default=os.path.join(ROOT, "data", "raw", "radata.json.gz"))
    ap.add_argument("--utan-radata", action="store_true", help="spara inte rådatan (annonstexterna)")
    a = ap.parse_args()
    raw = fetch_raw()
    extras = fetch_af_extras()
    prev = {}
    if os.path.exists(a.ut):
        with open(a.ut, encoding="utf-8") as f:
            prev = json.load(f)
    if extras:
        raw.update(regulated=extras["regulated"], transitions=extras["transitions"], afVersions=extras["versions"])
    ds = kompetens.build_dataset(raw)
    if not extras and prev.get("regulated"):  # behåll förra veckans i stället för att tappa dem
        ds["regulated"], ds["transitions"] = prev["regulated"], prev.get("transitions", {})
        known = {s["id"] for s in ds["skills"]}
        ds["skills"] += [s for s in prev["skills"] if s["id"] not in known and any(s["id"] in v for v in ds["regulated"].values())]
    fel = check(raw, ds)
    pm = prev.get("meta", {})  # jämför med förra körningen: ett kraftigt tapp tyder på att ett API har ändrats
    if (pm.get("field") or {}).get("id") == ds["meta"]["field"]["id"] and len(raw["ads"]) < 0.5 * pm.get("adsAnalyzed", 0):
        fel.append(f"{len(raw['ads'])} annonser mot {pm['adsAnalyzed']} förra gången")
    if fel:
        sys.exit("✗ Hämtningen ser trasig ut, inget skrevs: " + "; ".join(fel))
    kompetens.write_dataset(ds, a.ut)
    if not a.utan_radata:
        os.makedirs(os.path.dirname(os.path.abspath(a.radata)), exist_ok=True)
        with gzip.open(a.radata, "wt", encoding="utf-8") as f:
            json.dump(raw, f, ensure_ascii=False)
    print(f"• Klart: {len(ds['occupations'])} yrken, {len(ds['skills'])} kompetenser, {len(raw['ads'])} annonser -> {a.ut}")


if __name__ == "__main__":
    main()
