"""Kompetenscirkeln: från rådata till färdig datafil. Bara standardbiblioteket.

Här finns hela matchningen (tidigare match.py + recompute.py):
- n-gram-matchning (samma ord i samma ordning), förkortningar skiftlägeskänsliga
- stoppord för etiketter som är vanliga svenska/engelska ord (Vi, Access, Management ...)
- kompetenser med samma visningsnamn slås ihop (fem varianter av Cybersäkerhet -> en)
- alternativa etiketter som 'Java, ramverk' matchas som hela fraser, inte som 'Java'
- varje annons matchas mot alla kompetenser, inte bara dem taxonomin kopplar till yrkesgruppen
- egna tillägg och synonymer ur tillagg.json (Kubernetes, Terraform ... som saknas i taxonomin)

build_dataset(raw) tar rådatan (det hamta.py hämtar) och ger det sidan läser.
"""
import collections, json, os, re

TOK = re.compile(r"[A-Za-zÅÄÖåäöÉéÜüØøÆæ0-9#+.]+")

STOP = {k.lower() for k in ["Vi", "Access", "Progress", "Client", "Server", "Logic", "MOST", "Ada", "Management", "Nätverk",
        "Arbetsmiljö", "E-post", "Friskvård", "Research", "Source", "Hälso- och sjukvård", "Ledningssystem", "Office",
        "Go", "Basic", "Swift", "Design", "Sales", "Support", "Service", "Teams"]}
RENAME = {"CI": "CI/CD", "Node": "Node.js", "Amazon Web Services": "AWS", "Google Cloud Platform": "Google Cloud"}

TOP_SKILLS, MIN_SHARE, MIN_OCC_ADS = 40, 0.02, 15
TILLAGG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tillagg.json")

METHOD = ("Kompetensvikt = andel aktuella annonser i Platsbanken för yrket som nämner kompetensen. Matchning på hela ord "
          "och fraser ur Arbetsförmedlingens kompetenslista; vanliga ord som 'vi' och 'access' är bortfiltrerade och "
          "dubbletter sammanslagna.")


def tokens(text):
    out = []
    for t in TOK.findall(text):
        t = t.strip(".")
        if t: out.append(t)
    return out


def grams(text, n=4):
    tk = tokens(text); orig = set(); low = set()
    for i in range(len(tk)):
        for k in range(1, n + 1):
            if i + k > len(tk): break
            g = " ".join(tk[i:i + k]); orig.add(g); low.add(g.lower())
    return orig, low


def term_key(t, force_cs=False):
    """(nyckel, skiftlägeskänslig). Korta termer och versalförkortningar matchas skiftlägeskänsligt."""
    tk = tokens(t)
    if not tk or len(tk) > 4: return None
    key = " ".join(tk)
    alnum = re.sub(r"\W", "", t)
    cs = force_cs or len(alnum) <= 3 or (alnum.isupper() and len(alnum) <= 6)
    return (key if cs else key.lower(), cs)


def display(label):
    head = label.split(",")[0].strip()
    head = re.sub(r"\s*\(.*?\)", "", head).strip()
    hs = [x for x in head.split("/") if x]
    if len(hs) > 1 and all(re.sub(r"\W", "", x).isupper() and len(x) <= 6 for x in hs):
        return head
    segs = [s.strip() for s in label.split("/")]
    for s in segs:
        a = re.sub(r"\W", "", s)
        if s and "," not in s and a.isupper() and 2 <= len(a) <= 6 and len(segs) > 1:
            return s
    return head.split("/")[0].strip() or label


def terms(s):
    lab = s["label"]
    own = re.sub(r"\(.*?\)", "", lab.split(",")[0]).strip()
    cands = [own] if "/" not in own else []
    for a in s.get("alt", []) + s.get("hidden", []):
        cands.append(a)
    out = []
    for c in cands:
        c = re.sub(r"\(.*?\)", "", c).strip()
        if "," in c:
            first = c.split(",")[0].strip()
            c = first if first.lower() == own.lower() else c.replace(",", " ")
        if len(c) < 2 or c.lower() in STOP: continue
        k = term_key(c)
        if k and k not in out: out.append(k)
    for c in s.get("extra", []):  # egna termer ur tillagg.json: redan granskade, ingen stopplista
        k = term_key(c, c in s.get("cs", []))
        if k and k not in out: out.append(k)
    return out


def load_extras(path=TILLAGG):
    if not path or not os.path.exists(path):
        return {"tillagg": [], "synonymer": {}}
    with open(path, encoding="utf-8") as f:
        x = json.load(f)
    return {"tillagg": x.get("tillagg", []), "synonymer": x.get("synonymer", {})}


def barometer_from_rows(rows):
    """Fältmappningen mot Yrkesbarometern. Ändras strukturen (dec 2026) är det här som ska justeras."""
    barometer, omgang = {}, None
    for r in rows:
        omgang = omgang or r.get("omgang")
        barometer.setdefault(str(r.get("ssyk")), {})[r.get("lan")] = {
            "yrke": r.get("yb_yrke"), "jobbmojligheter": r.get("jobbmojligheter"),
            "rekrytering": r.get("rekryteringssituation"), "prognos": r.get("prognos"),
            "text": r.get("text_jobbmojligheter")}
    return barometer, omgang


def build_dataset(raw, extras=None):
    """Rådata -> dataset. Deterministisk: samma rådata ger samma fil."""
    extras = load_extras() if extras is None else extras
    skills = {}
    for gid, lst in raw["skillsByGroup"].items():
        for s in lst: skills.setdefault(s["id"], dict(s))
    rename = {}
    for sid, syn in extras["synonymer"].items():
        if sid not in skills: continue  # taxonomin kan ha bytt id; då faller synonymen bort utan fel
        skills[sid]["extra"] = syn.get("termer", [])
        skills[sid]["cs"] = syn.get("cs", [])
        if syn.get("visa"): rename[sid] = syn["visa"]
    for t in extras["tillagg"]:
        skills["x_" + re.sub(r"\W+", "-", t["label"].lower())] = {
            "label": t["label"], "headline": t.get("headline"), "extra": [t["label"]] + t.get("termer", []),
            "cs": t.get("cs", []), "own": True}
    # ett id per visningsnamn
    canon, disp = {}, {}
    for sid in sorted(skills):
        s = skills[sid]
        d = rename.get(sid) or (s["label"] if s.get("own") else display(s["label"]))
        d = RENAME.get(d, d)
        canon[sid] = disp.setdefault(d.lower(), (sid, d, s.get("headline") or "Övrigt"))[0]
    terms_by = {sid: (terms(s) if not s.get("own") else [k for k in (term_key(c, c in s["cs"]) for c in s["extra"]) if k])
                for sid, s in skills.items()}
    all_ids = sorted(skills)

    def ad_hits(a, g):
        o, l = g
        hit = set(canon.get(x, x) for x in a["skillIds"] if x in skills)
        for sid in all_ids:
            if canon[sid] in hit: continue
            for key, cs in terms_by[sid]:
                if key in (o if cs else l): hit.add(canon[sid]); break
        return hit

    def shares(ads, hits):
        c = collections.Counter()
        for a in ads: c.update(hits[a["id"]])
        out = [{"skillId": k, "share": round(v / max(len(ads), 1), 4)} for k, v in c.items()]
        out = [x for x in out if x["share"] >= MIN_SHARE]
        return sorted(out, key=lambda x: (-x["share"], x["skillId"]))[:TOP_SKILLS]  # stabil ordning vid lika andel

    ads_by_group = collections.defaultdict(list)
    for a in raw["ads"]: ads_by_group[a["groupId"]].append(a)
    group_skills, occ_skills = {}, {}
    for g in raw["groups"]:
        ads = ads_by_group[g["id"]]
        hits = {a["id"]: ad_hits(a, grams(a["text"])) for a in ads}
        group_skills[g["id"]] = shares(ads, hits)
        by_occ = collections.defaultdict(list)
        for a in ads:
            if a.get("occupationId"): by_occ[a["occupationId"]].append(a)
        for o in raw["occupations"]:
            if o["groupId"] == g["id"] and len(by_occ[o["id"]]) >= MIN_OCC_ADS:
                occ_skills[o["id"]] = shares(by_occ[o["id"]], hits)

    barometer, omgang = barometer_from_rows(raw.get("barometerRows", []))
    return {
        "meta": {"demo": False, "generated": raw.get("fetched"), "field": raw.get("field"), "barometerOmgang": omgang,
                 "adsAnalyzed": len(raw["ads"]),
                 "adsInField": sum(len(ads_by_group[g["id"]]) for g in raw["groups"] if not g.get("external")),
                 "method": METHOD, "sources": ["JobTech Taxonomy", "JobSearch (Platsbanken)", "Yrkesbarometern"]},
        "groups": raw["groups"], "occupations": raw["occupations"],
        "skills": [{"id": cid, "label": d, "headline": h} for (cid, d, h) in disp.values()],  # alla, så att sökningen hittar dem
        "groupSkills": group_skills, "occSkills": occ_skills, "barometer": barometer,
    }


def write_dataset(ds, path):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(ds, f, ensure_ascii=False)
