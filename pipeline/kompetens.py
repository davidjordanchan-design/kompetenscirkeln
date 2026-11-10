"""Kompetenscirkeln: från rådata till färdig datafil. Bara standardbiblioteket.

Här finns hela matchningen (tidigare match.py + recompute.py):
- n-gram-matchning (samma ord i samma ordning), förkortningar skiftlägeskänsliga
- stoppord för etiketter som är vanliga svenska/engelska ord (Vi, Access, Management ...)
- kompetenser med samma visningsnamn slås ihop (fem varianter av Cybersäkerhet -> en)
- alternativa etiketter som 'Java, ramverk' matchas som hela fraser, inte som 'Java'
- varje annons matchas mot alla kompetenser, inte bara dem taxonomin kopplar till yrkesgruppen
- egna tillägg, synonymer och fler stoppord ur tillagg.json (Kubernetes ... som saknas i taxonomin; Svenska,
  Utbildning, Miljö ... som är för allmänna för att skilja yrken åt)

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


SENT = re.compile(r"(?<=[.!?:])\s+|\n+")


def strip_boilerplate(text, patterns):
    """Tar bort meningar som är standardfraser (undanber oss säljare, AI i rekryteringen, mångfaldspolicy).
    De nämner kompetensord utan att vara krav."""
    if not patterns: return text
    return "\n".join(m for m in SENT.split(text) if not any(p.search(m) for p in patterns))


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
    if head.endswith("-"): head = label.strip()  # "Öron-, näs- och halssjukvård" är ett namn, inte en lista
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


def terms(s, stop=STOP):
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
        if len(c) < 2 or c.lower() in stop: continue
        k = term_key(c)
        if k and k not in out: out.append(k)
    for c in s.get("extra", []):  # egna termer ur tillagg.json: redan granskade, ingen stopplista
        k = term_key(c, c in s.get("cs", []))
        if k and k not in out: out.append(k)
    return out


def load_extras(path=TILLAGG):
    if not path or not os.path.exists(path):
        return {"tillagg": [], "synonymer": {}, "stopp": [], "standardfraser": []}
    with open(path, encoding="utf-8") as f:
        x = json.load(f)
    return {"tillagg": x.get("tillagg", []), "synonymer": x.get("synonymer", {}), "stopp": x.get("stopp", []),
            "standardfraser": x.get("standardfraser", [])}


def barometer_from_rows(rows):
    """Fältmappningen mot Yrkesbarometern. Ändras strukturen (dec 2026) är det här som ska justeras."""
    barometer, omgang = {}, None
    for r in rows:
        omgang = omgang or r.get("omgang")
        barometer.setdefault(str(r.get("ssyk")), {})[r.get("lan")] = {
            "jobbmojligheter": r.get("jobbmojligheter"), "rekrytering": r.get("rekryteringssituation"),
            "prognos": r.get("prognos")}
    return barometer, omgang


def build_dataset(raw, extras=None, stats=None):
    """Rådata -> dataset. Deterministisk: samma rådata ger samma fil."""
    extras = load_extras() if extras is None else extras
    skills = {}
    for s in raw.get("skills") or [x for lst in raw["skillsByGroup"].values() for x in lst]:  # äldre rådata: per grupp
        skills.setdefault(s["id"], dict(s))
    # reglerade behörigheter (legitimation m.m.) ska alltid finnas med som kompetenser, även om ingen annons nämner dem
    occ_ids = {o["id"] for o in raw["occupations"]}
    reg_raw = {oid: lst for oid, lst in (raw.get("regulated") or {}).items() if oid in occ_ids}
    for lst in reg_raw.values():
        for x in lst: skills.setdefault(x["id"], {"id": x["id"], "label": x["label"], "headline": "Reglerade behörigheter"})
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
    stop = STOP | {w.lower() for w in extras.get("stopp", [])}
    terms_by = {sid: (terms(s, stop) if not s.get("own") else [k for k in (term_key(c, c in s["cs"]) for c in s["extra"]) if k])
                for sid, s in skills.items()}
    boiler = [re.compile(p, re.I) for p in extras.get("standardfraser", [])]
    # uppslag term -> kompetenser, så att varje annons bara slår upp sina egna n-gram
    idx_cs, idx_ci = collections.defaultdict(set), collections.defaultdict(set)
    for sid, tl in terms_by.items():
        for key, cs in tl: (idx_cs if cs else idx_ci)[key].add(canon[sid])

    def ad_hits(a, g):
        o, l = g
        hit = set(canon.get(x, x) for x in a["skillIds"] if x in skills)
        for gram in o:
            if gram in idx_cs: hit |= idx_cs[gram]
        for gram in l:
            if gram in idx_ci: hit |= idx_ci[gram]
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
        hits = {a["id"]: ad_hits(a, grams(strip_boilerplate(a["text"], boiler))) for a in ads}
        if stats is not None:
            for h in hits.values(): stats.update(h)
        group_skills[g["id"]] = shares(ads, hits)
        by_occ = collections.defaultdict(list)
        for a in ads:
            if a.get("occupationId"): by_occ[a["occupationId"]].append(a)
        for o in raw["occupations"]:
            if o["groupId"] == g["id"] and len(by_occ[o["id"]]) >= MIN_OCC_ADS:
                occ_skills[o["id"]] = shares(by_occ[o["id"]], hits)

    barometer, omgang = barometer_from_rows(raw.get("barometerRows", []))
    used = {x["skillId"] for l in list(group_skills.values()) + list(occ_skills.values()) for x in l}
    regulated = {oid: sorted({canon[x["id"]] for x in lst}) for oid, lst in reg_raw.items()}
    used |= {sid for lst in regulated.values() for sid in lst}
    transitions = {oid: [x for x in lst if x in occ_ids and x != oid] for oid, lst in (raw.get("transitions") or {}).items() if oid in occ_ids}
    return {
        "meta": {"demo": False, "generated": raw.get("fetched"), "field": raw.get("field"), "barometerOmgang": omgang,
                 "adsAnalyzed": len(raw["ads"]),
                 "method": METHOD, "sources": ["JobTech Taxonomy", "JobSearch (Platsbanken)", "Yrkesbarometern", "Kompetensväljaren", "Närliggande yrken"],
                 "afVersions": raw.get("afVersions")},
        "fields": raw.get("fields") or [raw.get("field")],
        "groups": raw["groups"], "occupations": raw["occupations"],
        # bara kompetenser som förekommer i någon profil: övriga nämns i för få annonser för att påverka något
        "skills": [{"id": cid, "label": " ".join(d.split()), "headline": h} for (cid, d, h) in disp.values() if cid in used],
        "groupSkills": group_skills, "occSkills": occ_skills, "barometer": barometer,
        # Arbetsförmedlingens härledda datamängder: lagstadgade behörigheter per yrke, och yrken som både liknar
        # yrket och är statistiska yrkesövergångar
        "regulated": regulated, "transitions": {k: v for k, v in transitions.items() if v},
    }


def write_dataset(ds, path):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(ds, f, ensure_ascii=False)
