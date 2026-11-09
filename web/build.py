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
ads_it = meta.get("adsInField") or sum(g.get("adsAnalyzed", 0) for g in d["groups"] if not g.get("external"))
tokens = {"__ADS_IT__": num(ads_it), "__N_OCC__": num(sum(1 for o in d["occupations"] if not o.get("external"))),
          "__DATE__": f"{day} {MON[mth - 1]} {y}", "__OMGANG__": str(meta.get("barometerOmgang") or "")[:4]}
js = json.dumps(d, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
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
