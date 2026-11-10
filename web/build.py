"""Bygger web/index.html (lokal sida) och web/artifact.html (för claude.ai-artifact).

    python3 web/build.py                 # använder data/dataset.json
    python3 web/build.py annan.json      # annan datafil

index.html  = page.template.html med datan inlagd vid __DATA__.
artifact.html = samma sida utan doctype/html/head/body (Artifact-verktyget lägger till skalet);
                attributen på <html> sätts i stället av ett litet boot-skript.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "data", "dataset.json")

d = json.load(open(src, encoding="utf-8"))
meta = d.pop("meta", None) or {}
MON = "jan feb mars april maj juni juli aug sep okt nov dec".split()
num = lambda n: f"{n:,}".replace(",", "\u00a0")  # 4 632
y, mth, day = (int(x) for x in (meta.get("generated") or "1970-01-01")[:10].split("-"))
EMBED_TOP = 25  # kompetenser per profil i sidan (motorn använder 15 för matchningen, resten för sök och förslag)


def pack(d):
    """Kompakt form för inbäddning: index i stället för id och andelar i promille. Sidan packar upp den vid start."""
    fields = [f for f in (d.get("fields") or []) if f]
    fi = {f["id"]: i for i, f in enumerate(fields)}
    gi = {g["id"]: i for i, g in enumerate(d["groups"])}
    oi = {o["id"]: i for i, o in enumerate(d["occupations"])}
    prof = lambda lst: lst[:EMBED_TOP]
    used = sorted({x["skillId"] for l in list(d["groupSkills"].values()) + list(d["occSkills"].values()) for x in prof(l)})
    by_id = {s["id"]: s for s in d["skills"]}
    si = {sid: i for i, sid in enumerate(used)}
    heads = sorted({by_id[sid].get("headline") or "" for sid in used})
    hi = {h: i for i, h in enumerate(heads)}
    flat = lambda lst: [v for x in prof(lst) for v in (si[x["skillId"]], round(x["share"] * 1000))]
    bv = []

    def code(v):
        v = v or ""
        if v not in bv: bv.append(v)
        return bv.index(v)

    return {
        "f": [f["label"] for f in fields],
        "g": [[g["id"], g["label"], g["ssyk"], g.get("adsAnalyzed", 0), fi.get(g.get("fieldId"), -1)] for g in d["groups"]],
        "o": [[o["id"], o["label"], gi[o["groupId"]], o.get("adCount", 0)]
              + ([[[oi[x["id"]], x["pct"]] for x in o.get("substitutes", []) if x["id"] in oi]] if any(x["id"] in oi for x in o.get("substitutes", [])) else [])
              for o in d["occupations"]],
        "s": [[sid, by_id[sid]["label"], hi[by_id[sid].get("headline") or ""]] for sid in used], "h": heads,
        "gs": {gi[k]: flat(v) for k, v in d["groupSkills"].items() if v},
        "os": {oi[k]: flat(v) for k, v in d["occSkills"].items() if v},
        "b": {ssyk: {lan: [code(x.get("jobbmojligheter")), code(x.get("prognos"))] for lan, x in v.items()} for ssyk, v in d["barometer"].items()},
        "bv": bv,
    }


has_profile = lambda o: bool(d["occSkills"].get(o["id"]) or d["groupSkills"].get(o["groupId"]))
tokens = {"__ADS__": num(meta.get("adsAnalyzed") or sum(g.get("adsAnalyzed", 0) for g in d["groups"])),
          "__N_OCC__": num(sum(1 for o in d["occupations"] if has_profile(o))),
          "__N_FIELDS__": str(len(d.get("fields") or [1])),
          "__DATE__": f"{day} {MON[mth - 1]} {y}", "__OMGANG__": str(meta.get("barometerOmgang") or "")[:4]}
js = json.dumps(pack(d), ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
page = open(os.path.join(HERE, "page.template.html"), encoding="utf-8").read()
for k, v in tokens.items():
    page = page.replace(k, v)
page = page.replace("__DATA__", js)
open(os.path.join(HERE, "index.html"), "w", encoding="utf-8").write(page)

# --- artifact-variant ---
m = re.search(r"<html([^>]*)>", page)
attrs = dict(re.findall(r'([\w-]+)(?:="([^"]*)")?', m.group(1)))
lang = attrs.pop("lang", "sv")
sets = "".join(f'h.setAttribute("{k}","{v}");' for k, v in attrs.items())
boot = f'<script>(function(h){{h.lang="{lang}";{sets}}})(document.documentElement)</script>'
head = re.search(r"<head>(.*?)</head>", page, re.S).group(1)
body = re.search(r"<body[^>]*>(.*)</body>", page, re.S).group(1)
head = re.sub(r'<meta charset="[^"]*">\s*|<meta name="viewport"[^>]*>\s*|<title>.*?</title>\s*', "", head)
art = f"<title>Kompetenscirkeln</title>\n{boot}\n{head}\n{body}"
open(os.path.join(HERE, "artifact.html"), "w", encoding="utf-8").write(art)
print("index.html", len(page) // 1024, "kB · artifact.html", len(art) // 1024, "kB")
