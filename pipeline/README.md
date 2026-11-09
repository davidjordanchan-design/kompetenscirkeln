# Pipeline

En körning ger en färdig datafil. Bara Python 3.9+, inga beroenden.

```bash
python3 pipeline/hamta.py        # hämtar från JobTech -> data/dataset.json (+ data/raw/radata.json.gz)
python3 web/build.py             # bygger web/index.html och web/artifact.html
```

| Fil | Roll |
|---|---|
| `hamta.py` | Hämtar taxonomi, annonser och Yrkesbarometern. Avbryter utan att skriva något om hämtningen ser trasig ut. Annat yrkesområde: `FIELD_ID=<id>`. Inställningar i `CFG`. |
| `kompetens.py` | Hela matchningen och bygget av datafilen (`build_dataset`). Fältmappningen mot Yrkesbarometern finns i `barometer_from_rows`. |
| `tillagg.json` | Egna kompetenser som saknas i taxonomin (Kubernetes, React …) och synonymer till befintliga (Azure, Kafka, Intune). |
| `recompute.py` | Räknar om `data/dataset.json` ur sparad rådata utan nät. Används när matchningen eller `tillagg.json` ändrats. |
| `tests/` | `python3 -m unittest discover -s pipeline/tests -v`. Regressionstestet mot ögonblicksbilden 9 nov 2026 körs bara där `data/raw/radata.json.gz` finns. Vid avsiktlig ändring: `python3 pipeline/tests/test_pipeline.py --uppdatera`. |
| `colab/` | Anteckningsbok för manuell hämtning. Den genereras ur filerna ovan med `python3 pipeline/colab/bygg-notebook.py`. |

Veckojobbet `.github/workflows/uppdatera-och-publicera.yml` kör `hamta.py --utan-radata`, bygger sidan, sparar datafilen i repot och publicerar `web/` på GitHub Pages.

Rådatan (`data/raw/`) ligger inte i repot. Den innehåller annonstexter, som kan ha namn och kontaktuppgifter.
