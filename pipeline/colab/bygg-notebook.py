"""Bygger Colab-anteckningsboken ur pipeline/kompetens.py, hamta.py och tillagg.json, så att den aldrig
har en egen kopia av logiken. Kör efter ändringar i pipelinen: python3 pipeline/colab/bygg-notebook.py"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
P = os.path.join(HERE, "..")
read = lambda n: open(os.path.join(P, n), encoding="utf-8").read()
code = lambda src: {"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": src.splitlines(True)}
md = lambda src: {"cell_type": "markdown", "metadata": {}, "source": src.splitlines(True)}

cells = [
    md("# Kompetenscirkeln: hämta data för hand\n\nNormalt hämtas datan varje vecka av GitHub. Den här anteckningsboken "
       "är till för att göra samma hämtning manuellt, till exempel för ett annat yrkesområde.\n\n"
       "**Så gör du:** välj **Körning → Kör alla** (Runtime → Run all). Det tar några minuter. Du får `dataset.json` "
       "(färdig datafil, läggs i `data/`) och `radata.json.gz` (rådata med annonstexter, läggs i `data/raw/`, ska inte "
       "delas vidare)."),
    code('import os\nos.environ["FIELD_ID"] = "alla"  # alla yrkesområden. Ange ett id (t.ex. apaJ_2ja_LuF för Data/IT) för bara ett.'),
    code("%%writefile kompetens.py\n" + read("kompetens.py")),
    code("%%writefile tillagg.json\n" + read("tillagg.json")),
    code("%%writefile hamta.py\n" + read("hamta.py")),
    code("!python hamta.py --ut dataset.json --radata radata.json.gz"),
    code('try:\n    from google.colab import files\n    files.download("dataset.json")\n    files.download("radata.json.gz")\n'
         'except ImportError:\n    print("Inte i Colab: filerna ligger i samma mapp som anteckningsboken.")'),
]
nb = {"cells": cells, "metadata": {"kernelspec": {"display_name": "Python 3", "name": "python3"}, "language_info": {"name": "python"}},
      "nbformat": 4, "nbformat_minor": 5}
out = os.path.join(HERE, "kompetenscirkeln-hamta-data.ipynb")
json.dump(nb, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(out)
